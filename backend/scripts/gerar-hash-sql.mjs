#!/usr/bin/env node
// Gera a linha pronta do APLICADOS.md para um .sql — o hash junto.
//
// POR QUE MANUAL: gerar o hash automaticamente (hook de pre-commit, ou o guard
// reescrevendo o ledger) seria escrever o registro no MESMO commit do .sql,
// antes de o SQL ter rodado no RDS. Vira reflexo, e reflexo não é confirmação.
// É o mesmo argumento que descartou "marca em mensagem de commit" quando o
// workflow_dispatch foi desenhado — ver o comentário em .github/workflows/deploy.yml.
//
// Este script só formata: quem garante que o SQL rodou é quem roda.
//
// Uso:
//   node backend/scripts/gerar-hash-sql.mjs backend/prisma/sql/2026-09-01-x.sql
//   node backend/scripts/gerar-hash-sql.mjs 2026-09-01-x.sql          (procura nos dois dirs)
//   node backend/scripts/gerar-hash-sql.mjs 2026-09-01-x.sql --data 05/09/2026
//   node backend/scripts/gerar-hash-sql.mjs --todos                   (relista tudo)

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { DIRS_SQL, HASH_EXIBIDO, hashDe, ehIgnorado } from './lib/hash-sql.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** dd/mm/aaaa de hoje, no fuso de quem roda (a data é do RDS, não do CI). */
function hoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Aceita caminho relativo à raiz ou só o nome do arquivo. */
function resolverArquivo(entrada) {
  const direto = path.resolve(raiz, entrada);
  if (existsSync(direto)) return path.relative(raiz, direto).replace(/\\/g, '/');

  const alvo = path.basename(entrada).toLowerCase();
  for (const dir of DIRS_SQL) {
    const abs = path.join(raiz, dir);
    if (!existsSync(abs)) continue;
    const achado = readdirSync(abs).find((n) => n.toLowerCase() === alvo);
    if (achado) return `${dir}/${achado}`;
  }
  return null;
}

function linhaDo(relativo, data) {
  const hash = hashDe(path.join(raiz, relativo)).slice(0, HASH_EXIBIDO);
  return `| ${relativo} | \`${hash}\` | ${data} | Gustavo |  |`;
}

const args = process.argv.slice(2);
const iData = args.indexOf('--data');
const data = iData >= 0 ? args[iData + 1] : hoje();
const alvos = args.filter((a, i) => !a.startsWith('--') && i !== iData + 1);

if (args.includes('--todos')) {
  for (const dir of DIRS_SQL) {
    const abs = path.join(raiz, dir);
    if (!existsSync(abs)) continue;
    for (const nome of readdirSync(abs).sort()) {
      if (!nome.toLowerCase().endsWith('.sql') || ehIgnorado(nome)) continue;
      console.log(linhaDo(`${dir}/${nome}`, data));
    }
  }
  process.exit(0);
}

if (!alvos.length) {
  console.error('Uso: node backend/scripts/gerar-hash-sql.mjs <arquivo.sql> [--data dd/mm/aaaa]');
  console.error('     node backend/scripts/gerar-hash-sql.mjs --todos');
  process.exit(2);
}

let erro = false;
for (const alvo of alvos) {
  const relativo = resolverArquivo(alvo);
  if (!relativo) {
    console.error(`❌ Não encontrado: ${alvo}`);
    console.error(`   Procurei em: ${DIRS_SQL.join(', ')}`);
    erro = true;
    continue;
  }
  if (ehIgnorado(path.basename(relativo))) {
    console.error(`⚠️  ${relativo} tem o prefixo de ignorados — o guard não o cobra,`);
    console.error('   e ele não deve entrar no APLICADOS.md.');
    erro = true;
    continue;
  }
  console.log(linhaDo(relativo, data));
}

process.exit(erro ? 1 : 0);
