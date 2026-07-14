// Roda antes dos imports de cada arquivo de teste (worker isolado do Vitest).
// Aponta o Prisma para um SQLite temporário exclusivo deste arquivo de teste —
// os testes NUNCA tocam o banco de dev nem produção. As env definidas aqui têm
// precedência sobre o .env (dotenv não sobrescreve env já existente).
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = path.join(mkdtempSync(path.join(tmpdir(), 'estoque-vitest-')), 'test.db');

process.env.DATABASE_URL = `file:${dbFile.replace(/\\/g, '/')}`;
process.env.JWT_SECRET = 'segredo-de-teste-vitest-0123456789abcdef';
process.env.NODE_ENV = 'test';

execSync('npx prisma db push --skip-generate --schema=prisma/schema.prisma', {
  cwd: backendDir,
  env: process.env,
  stdio: 'ignore',
});

// requireAuth busca o usuário FRESCO do banco a cada request — os JWTs dos
// helpers (tests/helpers/api.js) precisam apontar para linhas reais. IDs fixos:
// 1 = admin (bypassa permissões), 2 = user comum com TODAS as permissões de
// módulo e ver_custo=false (espelha o backfill de produção). A senha não é
// usada pelos testes (o token é assinado direto), fica um hash placeholder.
const { PrismaClient } = await import('@prisma/client');
const { PERMISSOES_MODULOS } = await import('../src/utils/permissoes.js');
const prismaSeed = new PrismaClient();
const permsUser = JSON.stringify(Object.fromEntries(PERMISSOES_MODULOS.map((k) => [k, true])));
await prismaSeed.user.createMany({
  data: [
    { id: 1, name: 'Admin Teste', email: 'admin@teste.local', password: 'x', role: 'admin' },
    { id: 2, name: 'User Teste', email: 'user@teste.local', password: 'x', role: 'user', permissoes: permsUser },
  ],
});
await prismaSeed.$disconnect();
