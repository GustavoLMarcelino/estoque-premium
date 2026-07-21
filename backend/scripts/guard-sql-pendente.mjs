#!/usr/bin/env node
// Guard de deploy: impede que código suba para produção ANTES do SQL manual
// rodar no RDS.
//
// POR QUE EXISTE: no início do projeto a produção caiu porque um push levou
// código que referenciava uma coluna nova antes do ALTER TABLE rodar no RDS.
// A ordem correta (SQL no RDS → confirmar → push) era só disciplina manual.
// Aqui ela vira regra do pipeline.
//
// Roda no runner do GitHub, ANTES do job de deploy — nunca toca a EC2.
//
// Entrada (env):
//   GITHUB_EVENT_NAME  'push' | 'workflow_dispatch'
//   SHA_ANTES          github.event.before (pode vir 0000… em 1º push/force-push)
//   SHA_DEPOIS         github.event.after / github.sha
//   SQL_APLICADO       input do workflow_dispatch (a liberação consciente)
//   GITHUB_OUTPUT      arquivo de outputs do Actions (opcional, fora do CI)
//
// Saída: exit 0 libera, exit 1 trava o deploy.

import { execFileSync } from 'node:child_process';
import { existsSync, appendFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Os dois diretórios de SQL manual do projeto (convenções de nome diferentes,
// mesmo papel: DDL que precisa rodar no RDS a mão).
const DIRS_SQL = ['backend/prisma/sql', 'backend/prisma/manual'];
const SCHEMA_PROD = 'backend/prisma/schema.mysql.prisma';

const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();

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
 *  comparação (repo de 1 commit) — aí não há como detectar "novo neste push". */
function resolverRange(antes, depois) {
  const fim = existeCommit(depois) ? depois : 'HEAD';
  if (existeCommit(antes)) return { inicio: antes, fim, origem: 'range do push' };
  try {
    git('rev-parse', `${fim}^`); // tem pai?
    return { inicio: `${fim}^`, fim, origem: 'fallback HEAD~1 (1º push/force-push)' };
  } catch {
    return null;
  }
}

const ehSqlManual = (arquivo) => {
  const p = arquivo.replace(/\\/g, '/');
  return p.toLowerCase().endsWith('.sql') && DIRS_SQL.some((d) => p.startsWith(`${d}/`));
};

/** Lista de .sql que existem hoje no repo (para validar a liberação). */
function sqlNoRepo() {
  const achados = [];
  for (const dir of DIRS_SQL) {
    const abs = path.join(raiz, dir);
    if (!existsSync(abs)) continue;
    for (const nome of readdirSync(abs)) {
      if (nome.toLowerCase().endsWith('.sql')) achados.push(`${dir}/${nome}`);
    }
  }
  return achados;
}

function registrarOutput(chave, valor) {
  const destino = process.env.GITHUB_OUTPUT;
  if (!destino) return;
  // Heredoc: formato de output do Actions que aceita valor com quebra de linha.
  appendFileSync(destino, `${chave}<<GUARD_EOF\n${valor}\nGUARD_EOF\n`);
}

function travar(titulo, corpo, arquivos) {
  registrarOutput('bloqueado', 'true');
  registrarOutput('arquivos', arquivos.join(', '));
  registrarOutput('motivo', titulo);
  console.error(`\n${'━'.repeat(72)}\n${titulo}\n${'━'.repeat(72)}\n${corpo}\n`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Caminho 1: liberação consciente via workflow_dispatch.
//
// O plano do repositório (Free + privado) NÃO permite Environment com required
// reviewers — o GitHub responde 422 "billing plan supports". Então a liberação é
// o input digitado aqui. De propósito NÃO é marca em mensagem de commit nem
// arquivo de confirmação: os dois seriam escritos no mesmo commit do .sql, antes
// de o SQL ter rodado, e virariam reflexo. O input só existe DEPOIS do push, na
// UI do Actions — não dá para pré-armar.
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
  const bruto = (process.env.SQL_APLICADO || '').trim();
  const existentes = sqlNoRepo();

  if (!bruto) {
    travar(
      '🛑 DEPLOY BLOQUEADO — liberação manual sem o nome do SQL',
      [
        'Você acionou o deploy manual mas não informou qual SQL já rodou no RDS.',
        'A produção NÃO foi tocada.',
        '',
        'Informe em "sql_aplicado" o nome do arquivo que você rodou, por exemplo:',
        `  ${existentes[existentes.length - 1] || 'backend/prisma/sql/AAAA-MM-DD-assunto.sql'}`,
      ].join('\n'),
      [],
    );
  }

  const informados = bruto.split(/[,\s]+/).filter(Boolean);
  const invalidos = [];
  const validos = [];
  for (const item of informados) {
    const alvo = item.replace(/\\/g, '/');
    // Aceita caminho completo ou só o nome do arquivo.
    const match = existentes.find((e) => e === alvo || path.basename(e) === path.basename(alvo));
    if (match) validos.push(match);
    else invalidos.push(item);
  }

  if (invalidos.length) {
    travar(
      '🛑 DEPLOY BLOQUEADO — nome de SQL inválido na liberação',
      [
        `Não existe no repositório: ${invalidos.join(', ')}`,
        'A produção NÃO foi tocada.',
        '',
        'A liberação exige o NOME REAL do arquivo .sql que você rodou no RDS —',
        'valor genérico ("ok", "x", "sim") não passa, de propósito: é o que separa',
        'uma confirmação consciente de um reflexo.',
        '',
        'Arquivos disponíveis:',
        ...existentes.map((e) => `  • ${e}`),
      ].join('\n'),
      invalidos,
    );
  }

  console.log('✅ Liberação manual aceita — SQL confirmado como aplicado no RDS:');
  validos.forEach((v) => console.log(`   • ${v}`));
  console.log('\nLembre de registrar em backend/prisma/sql/APLICADOS.md (o ledger é o');
  console.log('histórico de "o que já rodou"; não é a porta de liberação).');
  registrarOutput('bloqueado', 'false');
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Caminho 2: push na main — detecção.
// ─────────────────────────────────────────────────────────────────────────────
const range = resolverRange(process.env.SHA_ANTES, process.env.SHA_DEPOIS);

if (!range) {
  console.log('ℹ️  Sem commit anterior para comparar — nada a verificar.');
  process.exit(0);
}

console.log(`Comparando ${range.inicio}..${range.fim} (${range.origem})`);

// --diff-filter=A: SÓ arquivo ADICIONADO. Editar um .sql existente (corrigir um
// comentário) ou deletar/reverter NÃO trava — não há DDL novo para rodar.
const adicionados = git('diff', '--diff-filter=A', '--name-only', `${range.inicio}..${range.fim}`)
  .split('\n').filter(Boolean);
const alterados = git('diff', '--name-only', `${range.inicio}..${range.fim}`)
  .split('\n').filter(Boolean);

const sqlNovos = adicionados.filter(ehSqlManual);

// Migrations do Prisma (backend/prisma/migrations/) são do SQLite de DEV e não
// afetam o RDS — nunca entram nesta conta. Nem precisam ser filtradas: não
// estão em DIRS_SQL.

if (sqlNovos.length) {
  travar(
    '🛑 DEPLOY BLOQUEADO — SQL manual pendente',
    [
      'Este push adiciona SQL que precisa rodar no RDS ANTES do código subir:',
      ...sqlNovos.map((f) => `  • ${f}`),
      '',
      'A produção NÃO foi tocada e segue na versão anterior.',
      '',
      'PARA LIBERAR:',
      '  1. Rode o SQL no RDS (faça snapshot antes).',
      '  2. Actions → "Deploy para Produção (EC2)" → Run workflow',
      `  3. Em "sql_aplicado", informe: ${sqlNovos.map((f) => path.basename(f)).join(', ')}`,
      '  4. Run workflow → o deploy segue normalmente.',
      '  5. Registre o que rodou em backend/prisma/sql/APLICADOS.md.',
      '',
      'Por que existe: código que referencia coluna inexistente derruba a API —',
      'foi exatamente assim que a produção caiu no início do projeto.',
    ].join('\n'),
    sqlNovos,
  );
}

// Gatilho secundário: mexeu no schema de PRODUÇÃO e não escreveu SQL nenhum.
// Cobre o esquecimento — sem arquivo .sql, o gatilho principal passaria batido.
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

console.log('✅ Nenhum SQL manual pendente neste push — deploy liberado.');
registrarOutput('bloqueado', 'false');
process.exit(0);
