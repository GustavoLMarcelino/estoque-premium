// Compara models e campos entre schema.prisma (SQLite/dev) e
// schema.mysql.prisma (MySQL/prod). Falha (exit 1) se um model ou campo
// existir em um schema e não no outro. Diferenças INTENCIONAIS são ignoradas:
// tipos (String vs enum), atributos @db.*, blocos enum (só existem no MySQL).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Extrai { model: Set(campos) } de um schema Prisma (parse por linha). */
function extrairModels(arquivo) {
  const texto = readFileSync(path.join(raiz, 'prisma', arquivo), 'utf8');
  const models = new Map();
  let atual = null;
  for (const linhaBruta of texto.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (!linha || linha.startsWith('//')) continue;
    const abreModel = /^model\s+(\w+)\s*\{/.exec(linha);
    if (abreModel) {
      atual = new Set();
      models.set(abreModel[1], atual);
      continue;
    }
    // blocos enum/datasource/generator não interessam
    if (/^(enum|datasource|generator)\s/.test(linha)) { atual = null; continue; }
    if (linha === '}') { atual = null; continue; }
    if (!atual) continue;
    if (linha.startsWith('@@')) continue; // índices/maps do model
    const campo = /^(\w+)\s/.exec(linha);
    if (campo) atual.add(campo[1]);
  }
  return models;
}

const dev = extrairModels('schema.prisma');
const prod = extrairModels('schema.mysql.prisma');
const problemas = [];

for (const nome of new Set([...dev.keys(), ...prod.keys()])) {
  if (!dev.has(nome)) { problemas.push(`model "${nome}" existe só no schema.mysql.prisma`); continue; }
  if (!prod.has(nome)) { problemas.push(`model "${nome}" existe só no schema.prisma`); continue; }
  for (const campo of dev.get(nome)) {
    if (!prod.get(nome).has(campo)) problemas.push(`${nome}.${campo} existe só no schema.prisma`);
  }
  for (const campo of prod.get(nome)) {
    if (!dev.get(nome).has(campo)) problemas.push(`${nome}.${campo} existe só no schema.mysql.prisma`);
  }
}

if (problemas.length) {
  console.error('DRIFT entre os schemas Prisma detectado:');
  for (const p of problemas) console.error(`  - ${p}`);
  console.error('Edite os DOIS schemas (dev e prod) ao alterar um model.');
  process.exit(1);
}
console.log(`Schemas em sincronia: ${dev.size} models, sem drift de campos.`);
