#!/usr/bin/env node
// Guard de deploy: impede que código suba para produção ANTES do SQL manual
// rodar no RDS.
//
// POR QUE EXISTE: no início do projeto a produção caiu porque um push levou
// código que referenciava uma coluna nova antes do ALTER TABLE rodar no RDS.
// A ordem correta (SQL no RDS → confirmar → push) era só disciplina manual.
// Aqui ela vira regra do pipeline.
//
// ─────────────────────────────────────────────────────────────────────────────
// O FURO QUE ESTE ARQUIVO FECHA (comprovado no M2)
//
// A versão anterior detectava SQL pendente pelo DIFF DO PUSH: "este push
// adiciona algum .sql?". Isso deixava passar o PUSH LATERAL:
//
//   push 1: adiciona 2026-08-03-parcelas.sql + código  → guard BLOQUEIA ✅
//   push 2: qualquer outra coisa, sem .sql no range    → guard LIBERA  ❌
//            └─ e o deploy leva o HEAD, que CONTÉM o código do push 1,
//               com o .sql ainda não aplicado no RDS.
//
// Foi exatamente assim que o commit do APLICADOS.md liberou o M2 sem passar
// pelo workflow_dispatch. O bloqueio dependia de o SQL estar no range daquele
// push; bastava um push seguinte para o gate sumir.
//
// A CORREÇÃO: o gate deixa de olhar o DIFF e passa a olhar o ESTADO. A pergunta
// não é mais "este push traz SQL novo?" e sim "existe, no repositório, algum
// .sql que ainda não foi registrado como aplicado?". Um .sql pendente bloqueia
// TODO deploy — inclusive pushes laterais — até ser registrado.
//
// Consequência de desenho: o APLICADOS.md deixa de ser só memória e vira o
// registro de cobertura que destrava o pipeline. Esquecer de registrar não é
// mais um detalhe de documentação: trava o próximo deploy. É o oposto do furo
// anterior, em que esquecer de registrar não tinha consequência nenhuma.
// ─────────────────────────────────────────────────────────────────────────────
//
// Roda no runner do GitHub, ANTES do job de deploy — nunca toca a EC2.
//
// Entrada (env):
//   GITHUB_EVENT_NAME  'push' | 'workflow_dispatch'
//   SHA_ANTES          github.event.before (pode vir 0000… em 1º push/force-push)
//   SHA_DEPOIS         github.event.after / github.sha
//   SQL_APLICADO       input do workflow_dispatch (a liberação consciente)
//   GITHUB_OUTPUT      arquivo de outputs do Actions (opcional, fora do CI)
//   GUARD_RAIZ         raiz alternativa — só para os testes com fixtures
//
// Saída: exit 0 libera, exit 1 trava o deploy.

import { execFileSync } from 'node:child_process';
import { existsSync, appendFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = process.env.GUARD_RAIZ
  ? path.resolve(process.env.GUARD_RAIZ)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Os dois diretórios de SQL manual do projeto (convenções de nome diferentes,
// mesmo papel: DDL que precisa rodar no RDS a mão).
const DIRS_SQL = ['backend/prisma/sql', 'backend/prisma/manual'];
const SCHEMA_PROD = 'backend/prisma/schema.mysql.prisma';
const LEDGER = 'backend/prisma/sql/APLICADOS.md';

// backend/prisma/migrations/ NÃO entra em DIRS_SQL de propósito: são migrations
// do SQLite de DEV, aplicadas por `prisma migrate`, e não tocam o RDS. Só o SQL
// manual dos dois diretórios acima precisa de aplicação humana em produção.

const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();

/* ─────────────────────── cobertura pelo ledger ─────────────────────── */

/** Todos os .sql manuais que existem hoje no repositório. */
function sqlNoRepo() {
  const achados = [];
  for (const dir of DIRS_SQL) {
    const abs = path.join(raiz, dir);
    if (!existsSync(abs)) continue;
    for (const nome of readdirSync(abs)) {
      if (nome.toLowerCase().endsWith('.sql')) achados.push(`${dir}/${nome}`);
    }
  }
  return achados.sort();
}

const chave = (p) => path.basename(String(p).replace(/\\/g, '/')).toLowerCase();

/**
 * Nomes de .sql registrados no APLICADOS.md.
 *
 * Lê SÓ a primeira célula das linhas de tabela markdown — a coluna "Arquivo".
 * Deliberadamente NÃO varre o texto inteiro atrás de "*.sql": uma menção em
 * prosa ("ainda não rodei o X.sql") passaria a valer como registro, e um guard
 * não pode ser destravado por uma frase solta.
 *
 * Robusto a: espaços em volta das células, caminho completo ou nome puro
 * (compara por basename), linha de cabeçalho, linha separadora (|---|---|),
 * célula que não é arquivo (a linha coletiva "_(anteriores ao guard)_") e
 * exemplos dentro de comentário HTML (removidos antes do parse).
 */
function lerLedger() {
  const abs = path.join(raiz, LEDGER);
  if (!existsSync(abs)) return null; // ausente ≠ vazio: o chamador trata

  const semComentarios = readFileSync(abs, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const registrados = new Set();

  for (const linha of semComentarios.split('\n')) {
    const t = linha.trim();
    if (!t.startsWith('|')) continue;
    // '| a | b |' → ['', ' a ', ' b ', ''] — a 1ª célula de conteúdo é [1]
    const primeira = (t.split('|')[1] || '').trim();
    if (!primeira.toLowerCase().endsWith('.sql')) continue; // cabeçalho, separador, coletiva
    registrados.add(chave(primeira));
  }
  return registrados;
}

/** .sql presentes no repo que o ledger não registra. `extras` = nomes vindos do
 *  input de liberação manual (já rodaram no RDS, ainda não foram para o ledger). */
function sqlPendentes(registrados, extras = []) {
  const cobertos = new Set([...registrados, ...extras.map(chave)]);
  return sqlNoRepo().filter((f) => !cobertos.has(chave(f)));
}

/* ───────────── detecção por range (só o gatilho de schema) ───────────── */

/** Commit existe no clone? Force-push reescreve história e o SHA anterior some. */
function existeCommit(sha) {
  if (!sha || /^0+$/.test(sha)) return false;
  try {
    git('cat-file', '-e', `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

/** Range a diferenciar. Cai para HEAD~1..HEAD quando o SHA anterior não serve
 *  (1º push, force-push, shallow clone sem o objeto). null = sem base de
 *  comparação — aí o gatilho de schema simplesmente não roda. */
function resolverRange(antes, depois) {
  try {
    const fim = existeCommit(depois) ? depois : 'HEAD';
    if (existeCommit(antes)) return { inicio: antes, fim, origem: 'range do push' };
    git('rev-parse', `${fim}^`); // tem pai?
    return { inicio: `${fim}^`, fim, origem: 'fallback HEAD~1 (1º push/force-push)' };
  } catch {
    return null;
  }
}

/* ─────────────────────────── saída ─────────────────────────── */

function registrarOutput(chaveOut, valor) {
  const destino = process.env.GITHUB_OUTPUT;
  if (!destino) return;
  // Heredoc: formato de output do Actions que aceita valor com quebra de linha.
  appendFileSync(destino, `${chaveOut}<<GUARD_EOF\n${valor}\nGUARD_EOF\n`);
}

function travar(titulo, corpo, arquivos) {
  registrarOutput('bloqueado', 'true');
  registrarOutput('arquivos', arquivos.join(', '));
  registrarOutput('motivo', titulo);
  console.error(`\n${'━'.repeat(72)}\n${titulo}\n${'━'.repeat(72)}\n${corpo}\n`);
  process.exit(1);
}

/* ─────────────────────────── execução ─────────────────────────── */

const ehDispatch = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';

// Liberação manual: nomes de .sql que já rodaram no RDS mas ainda não estão no
// ledger. Só existe DEPOIS do push, digitado na UI do Actions — não dá para
// pré-armar num commit (marca em mensagem ou arquivo viraria reflexo, escrito
// junto com o próprio .sql, antes de o SQL ter rodado).
const informados = ehDispatch
  ? (process.env.SQL_APLICADO || '').trim().split(/[,\s]+/).filter(Boolean)
  : [];

const existentes = sqlNoRepo();

// Nome informado tem que ser arquivo REAL: valor genérico ("ok", "x", "sim")
// não passa, de propósito — é o que separa confirmação consciente de reflexo.
if (informados.length) {
  const invalidos = informados.filter((item) => !existentes.some((e) => chave(e) === chave(item)));
  if (invalidos.length) {
    travar(
      '🛑 DEPLOY BLOQUEADO — nome de SQL inválido na liberação',
      [
        `Não existe no repositório: ${invalidos.join(', ')}`,
        'A produção NÃO foi tocada.',
        '',
        'A liberação exige o NOME REAL do arquivo .sql que você rodou no RDS.',
        '',
        'Arquivos disponíveis:',
        ...existentes.map((e) => `  • ${e}`),
      ].join('\n'),
      invalidos,
    );
  }
}

// ── Gate principal: COBERTURA. Vale para push E para workflow_dispatch. ──
const registrados = lerLedger();

if (registrados === null) {
  travar(
    '🛑 DEPLOY BLOQUEADO — ledger de SQL aplicado não encontrado',
    [
      `O arquivo ${LEDGER} não existe.`,
      'A produção NÃO foi tocada.',
      '',
      'Ele é o registro de quais .sql já rodaram no RDS e, desde o hardening do',
      'guard, é o que destrava o deploy. Sem ele não há como saber o que foi',
      'aplicado — o guard falha FECHADO, de propósito.',
    ].join('\n'),
    [LEDGER],
  );
}

const pendentes = sqlPendentes(registrados, informados);

if (pendentes.length) {
  travar(
    '🛑 DEPLOY BLOQUEADO — SQL manual pendente',
    [
      'Existe SQL no repositório que ainda não consta como aplicado no RDS:',
      ...pendentes.map((f) => `  • ${f}`),
      '',
      'A produção NÃO foi tocada e segue na versão anterior.',
      '',
      'ATENÇÃO: este bloqueio NÃO depende de este push ter trazido o .sql. Enquanto',
      'houver SQL não registrado, TODO deploy fica travado — inclusive pushes que',
      'não têm nada a ver com banco. É proposital: antes, bastava um push seguinte',
      'para liberar o deploy do código cujo SQL ainda não tinha rodado.',
      '',
      'PARA LIBERAR:',
      '  1. Rode o SQL no RDS (faça snapshot antes).',
      `  2. Registre em ${LEDGER}, uma linha por arquivo:`,
      `     | ${pendentes[0]} | DD/MM/AAAA | Quem rodou | Observação |`,
      '  3. Faça push do registro — o deploy destrava sozinho.',
      '',
      'Alternativa (deploy imediato, sem esperar o push do registro):',
      '  Actions → "Deploy para Produção (EC2)" → Run workflow →',
      `  em "sql_aplicado": ${pendentes.map((f) => path.basename(f)).join(', ')}`,
      `  ⚠️  Isso libera ESTE deploy. Registre em ${LEDGER} depois, senão o`,
      '     próximo push volta a travar aqui.',
      '',
      'Por que existe: código que referencia coluna inexistente derruba a API —',
      'foi exatamente assim que a produção caiu no início do projeto.',
    ].join('\n'),
    pendentes,
  );
}

// ── Gatilho secundário: mexeu no schema de PRODUÇÃO sem escrever SQL nenhum. ──
// Continua sendo por RANGE, e não por estado, porque não existe estado que
// responda "o schema.mysql.prisma bate com o RDS?" — só a intenção do push.
// Cobre o esquecimento: sem arquivo .sql, o gate de cobertura passa batido.
// Não roda no dispatch: lá a liberação já é consciente.
if (!ehDispatch) {
  const range = resolverRange(process.env.SHA_ANTES, process.env.SHA_DEPOIS);
  if (range) {
    console.log(`Comparando ${range.inicio}..${range.fim} (${range.origem})`);
    const alterados = git('diff', '--name-only', `${range.inicio}..${range.fim}`)
      .split('\n').filter(Boolean);

    if (alterados.includes(SCHEMA_PROD)) {
      travar(
        '🛑 DEPLOY BLOQUEADO — schema de produção alterado sem SQL manual',
        [
          `Este push altera ${SCHEMA_PROD} mas não adiciona nenhum .sql em:`,
          ...DIRS_SQL.map((d) => `  • ${d}/`),
          '',
          'A produção NÃO foi tocada.',
          '',
          'O schema.mysql.prisma descreve o RDS, mas NÃO o altera: o Prisma não roda',
          'migration no deploy. Sem o DDL correspondente, o código sobe esperando uma',
          'coluna que o banco não tem.',
          '',
          'O QUE FAZER:',
          '  • Se falta o DDL: escreva o .sql, rode no RDS e faça um novo push.',
          '  • Se a mudança NÃO precisa de DDL (só comentário, @map, formatação) ou o',
          '    SQL já rodou antes: Actions → "Deploy para Produção (EC2)" →',
          '    Run workflow → informe em "sql_aplicado" o .sql correspondente.',
        ].join('\n'),
        [SCHEMA_PROD],
      );
    }
  }
}

if (informados.length) {
  console.log('✅ Liberação manual aceita — SQL confirmado como aplicado no RDS:');
  informados.forEach((v) => console.log(`   • ${v}`));
  console.log(`\n⚠️  Registre em ${LEDGER}, senão o próximo push trava aqui.`);
}
console.log(`✅ Cobertura OK — os ${existentes.length} .sql do repositório constam como aplicados.`);
registrarOutput('bloqueado', 'false');
process.exit(0);
