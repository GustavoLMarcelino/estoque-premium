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
// O QUE O HASH FECHA (e o que continua aberto)
//
// A cobertura por NOME não via um caso: editar o conteúdo de um .sql já
// registrado. Mesmo nome, DDL diferente — o ledger dizia "aplicado" sobre uma
// versão do arquivo que não existe mais, e o deploy passava verde. A coluna
// Hash do ledger fecha isso: o conteúdo passa a fazer parte do registro.
//
// CONTINUA ABERTO, de propósito: nada impede escrever o .sql e a linha do
// ledger no MESMO commit, sem nunca ter rodado o SQL no RDS. O hash prova QUAL
// conteúdo foi registrado, jamais QUE ele rodou. Fechar isso exigiria consultar
// o RDS a partir do pipeline — decidido como custo de infra que não se paga
// hoje. É risco conhecido e aceito; ver a seção do guard em DEPLOY.md.
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
import { existsSync, appendFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  DIRS_SQL, HASH_EXIBIDO, FORMATO_HASH, PREFIXO_IGNORADO, ehIgnorado, hashDe,
} from './lib/hash-sql.mjs';

const raiz = process.env.GUARD_RAIZ
  ? path.resolve(process.env.GUARD_RAIZ)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// DIRS_SQL, o prefixo de ignorados e a função de hash vivem em lib/hash-sql.mjs,
// compartilhados com scripts/gerar-hash-sql.mjs — o hash que o ledger recebe e o
// hash que o guard confere precisam ser a MESMA função, não duas iguais.
const SCHEMA_PROD = 'backend/prisma/schema.mysql.prisma';
const LEDGER = 'backend/prisma/sql/APLICADOS.md';

/** Sentinela: célula de hash preenchida, mas fora do formato. Distinta de null
 *  (coluna ausente/vazia) porque a causa e a correção são outras — e porque
 *  tratar lixo como "não informado" esconderia um erro de digitação. */
const INVALIDO = Symbol('hash-invalido');

// backend/prisma/migrations/ NÃO entra em DIRS_SQL de propósito: são migrations
// do SQLite de DEV, aplicadas por `prisma migrate`, e não tocam o RDS. Só o SQL
// manual dos dois diretórios acima precisa de aplicação humana em produção.

const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();

/* ─────────────────────── cobertura pelo ledger ─────────────────────── */

/** .sql manuais que o guard cobra hoje, e os que ignora pelo prefixo.
 *
 *  Ignorados NUNCA entram em `achados`: não são cobrados no ledger e também não
 *  valem como nome no `sql_aplicado` do dispatch — coerente, já que eles não
 *  devem rodar no RDS. */
function varrerSql() {
  const achados = [];
  const ignorados = [];
  for (const dir of DIRS_SQL) {
    const abs = path.join(raiz, dir);
    if (!existsSync(abs)) continue;
    for (const nome of readdirSync(abs)) {
      if (!nome.toLowerCase().endsWith('.sql')) continue;
      (ehIgnorado(nome) ? ignorados : achados).push(`${dir}/${nome}`);
    }
  }
  return { achados: achados.sort(), ignorados: ignorados.sort() };
}

const sqlNoRepo = () => varrerSql().achados;

const chave = (p) => path.basename(String(p).replace(/\\/g, '/')).toLowerCase();

/**
 * Registros do APLICADOS.md: basename → hash esperado.
 *
 * Valor do Map:
 *   string    hash (possivelmente truncado) da coluna "Hash"
 *   null      linha sem coluna de hash, ou célula vazia
 *   INVALIDO  célula preenchida fora do formato hex
 *
 * Lê SÓ as células por POSIÇÃO — [1] "Arquivo", [2] "Hash". Deliberadamente NÃO
 * varre o texto inteiro atrás de "*.sql": uma menção em prosa ("ainda não rodei
 * o X.sql") passaria a valer como registro, e um guard não pode ser destravado
 * por uma frase solta.
 *
 * Robusto a: espaços em volta das células, crases em volta do hash, caminho
 * completo ou nome puro (compara por basename), linha de cabeçalho, linha
 * separadora (|---|---|), célula que não é arquivo (a linha coletiva
 * "_(anteriores ao guard)_") e exemplos dentro de comentário HTML.
 */
function lerLedger() {
  const abs = path.join(raiz, LEDGER);
  if (!existsSync(abs)) return null; // ausente ≠ vazio: o chamador trata

  const semComentarios = readFileSync(abs, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const registrados = new Map();

  for (const linha of semComentarios.split('\n')) {
    const t = linha.trim();
    if (!t.startsWith('|')) continue;
    // '| a | b |' → ['', ' a ', ' b ', ''] — a 1ª célula de conteúdo é [1]
    const celulas = t.split('|');
    const primeira = (celulas[1] || '').trim();
    if (!primeira.toLowerCase().endsWith('.sql')) continue; // cabeçalho, separador, coletiva

    const bruto = (celulas[2] || '').trim().replace(/`/g, '');
    let hash = null;
    if (bruto !== '') hash = FORMATO_HASH.test(bruto) ? bruto.toLowerCase() : INVALIDO;
    registrados.set(chave(primeira), hash);
  }
  return registrados;
}

/**
 * .sql do repo que o ledger não cobre, com o MOTIVO de cada um.
 *
 * `extras` = nomes vindos do input de liberação manual. Eles cobrem por NOME e
 * ignoram o hash de propósito: o dispatch é a confirmação consciente, e exigir
 * 12 hex digitados na UI do Actions treinaria a colar sem ler — o oposto do que
 * o input existe para provocar.
 */
function sqlPendentes(registrados, extras = []) {
  const liberados = new Set(extras.map(chave));
  const problemas = [];

  for (const f of sqlNoRepo()) {
    const k = chave(f);
    if (liberados.has(k)) continue;
    if (!registrados.has(k)) { problemas.push({ arquivo: f, motivo: 'nao-registrado' }); continue; }

    const esperado = registrados.get(k);
    if (esperado === null) { problemas.push({ arquivo: f, motivo: 'sem-hash' }); continue; }
    if (esperado === INVALIDO) { problemas.push({ arquivo: f, motivo: 'hash-invalido' }); continue; }

    // O ledger pode trazer o hash truncado; o do disco é sempre completo.
    // Daí a direção: real.startsWith(esperado), nunca o contrário.
    const real = hashDe(path.join(raiz, f));
    if (!real.startsWith(esperado)) {
      problemas.push({ arquivo: f, motivo: 'hash-divergente', esperado, real: real.slice(0, HASH_EXIBIDO) });
    }
  }
  return problemas;
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

const { achados: existentes, ignorados } = varrerSql();

// NUNCA silencioso: exclusão que ninguém vê é exclusão que ninguém audita.
// Sai em todo run, inclusive nos que liberam.
if (ignorados.length) {
  console.log(`ℹ️  ${ignorados.length} .sql ignorado(s) pelo prefixo "${PREFIXO_IGNORADO}" (não é DDL de produção):`);
  ignorados.forEach((f) => console.log(`   • ${f}`));
}

// Nome informado tem que ser arquivo REAL: valor genérico ("ok", "x", "sim")
// não passa, de propósito — é o que separa confirmação consciente de reflexo.
// Arquivo ignorado também não vale: ele não roda no RDS, não há o que liberar.
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

// Conteúdo alterado depois de registrado é um problema DIFERENTE de arquivo não
// registrado, e a ação corretiva também é outra — por isso mensagem própria, e
// primeiro: se as duas coisas acontecem no mesmo push, esta é a mais sutil.
const divergentes = pendentes.filter((p) => p.motivo === 'hash-divergente');

if (divergentes.length) {
  travar(
    '🛑 DEPLOY BLOQUEADO — .sql alterado depois de registrado',
    [
      ...divergentes.flatMap((p) => [
        `  • ${p.arquivo}`,
        `      registrado: ${p.esperado}`,
        `      no disco:   ${p.real}`,
      ]),
      '',
      'A produção NÃO foi tocada e segue na versão anterior.',
      '',
      'O conteúdo mudou desde que a linha entrou no ledger. O nome é o mesmo, então',
      'a cobertura por nome não veria diferença — foi para isso que o hash existe.',
      '',
      'O DDL QUE ESTÁ NO DISCO NÃO RODOU NO RDS: o que rodou foi a versão registrada.',
      '',
      'O QUE FAZER:',
      '  • Se o DDL novo precisa rodar: rode no RDS (snapshot antes) e atualize o',
      '    hash da linha com',
      `        node backend/scripts/gerar-hash-sql.mjs ${path.basename(divergentes[0].arquivo)}`,
      '  • Se a mudança é cosmética (comentário, formatação, espaçamento): rode o',
      '    mesmo comando e atualize só o hash — nada a fazer no banco.',
      '',
      'Editar um .sql já aplicado é, em geral, sinal de que o certo seria um arquivo',
      'NOVO: o histórico do que rodou no RDS fica mais fiel assim.',
    ].join('\n'),
    divergentes.map((p) => p.arquivo),
  );
}

if (pendentes.length) {
  const rotulo = {
    'nao-registrado': 'não consta no ledger',
    'sem-hash': 'consta no ledger, mas sem a coluna Hash',
    'hash-invalido': 'consta no ledger com hash em formato inválido',
  };
  travar(
    '🛑 DEPLOY BLOQUEADO — SQL manual pendente',
    [
      'Existe SQL no repositório que ainda não consta como aplicado no RDS:',
      ...pendentes.map((p) => `  • ${p.arquivo} — ${rotulo[p.motivo] || p.motivo}`),
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
      `  2. Registre em ${LEDGER}, uma linha por arquivo. A linha pronta sai de:`,
      `        node backend/scripts/gerar-hash-sql.mjs ${path.basename(pendentes[0].arquivo)}`,
      '  3. Faça push do registro — o deploy destrava sozinho.',
      '',
      'Alternativa (deploy imediato, sem esperar o push do registro):',
      '  Actions → "Deploy para Produção (EC2)" → Run workflow →',
      `  em "sql_aplicado": ${pendentes.map((p) => path.basename(p.arquivo)).join(', ')}`,
      `  ⚠️  Isso libera ESTE deploy. Registre em ${LEDGER} depois, senão o`,
      '     próximo push volta a travar aqui.',
      '',
      `Se algum destes NÃO é DDL de produção (rollback guardado, consulta de`,
      `diagnóstico), renomeie com o prefixo "${PREFIXO_IGNORADO}" — o guard passa a`,
      'ignorá-lo, e ele não precisa de linha no ledger.',
      '',
      'Por que existe: código que referencia coluna inexistente derruba a API —',
      'foi exatamente assim que a produção caiu no início do projeto.',
    ].join('\n'),
    pendentes.map((p) => p.arquivo),
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

    // O push trouxe DDL junto? Se trouxe, mexer no schema não é esquecimento —
    // é o ritual correto, e quem trava (ou libera) é o gate de cobertura acima.
    //
    // Sem esta condição o gatilho pegava também o caminho certo: schema + .sql
    // + linha no ledger num push só (legítimo quando o SQL já rodou no RDS)
    // travava acusando falta de um .sql que estava ali, e a única saída era o
    // workflow_dispatch — exceção pedida justamente a quem seguiu o ritual.
    //
    // Conta só arquivo ADICIONADO/RENOMEADO, não modificado. Antes do hash isso
    // era a única rede contra editar um .sql já registrado (mesmo nome, DDL
    // diferente); hoje quem pega esse caso é a comparação de hash, com mensagem
    // própria. Manter aqui como AR e não AM segue certo: um .sql modificado no
    // mesmo push que o schema já trava pelo hash, e deixar o gatilho disparar
    // junto só produziria duas mensagens para o mesmo fato.
    //
    // Arquivo com prefixo de ignorado não conta como "trouxe DDL": ele não roda
    // no RDS, então não pode servir de álibi para uma mudança de schema.
    const trouxeSql = git('diff', '--name-only', '--diff-filter=AR', `${range.inicio}..${range.fim}`)
      .split('\n').filter(Boolean)
      .some((f) => f.toLowerCase().endsWith('.sql')
        && DIRS_SQL.some((d) => f.startsWith(`${d}/`))
        && !ehIgnorado(path.basename(f)));

    if (alterados.includes(SCHEMA_PROD) && !trouxeSql) {
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
console.log(
  `✅ Cobertura OK — os ${existentes.length} .sql do repositório constam como aplicados, `
  + 'com o conteúdo idêntico ao registrado.',
);
registrarOutput('bloqueado', 'false');
process.exit(0);
