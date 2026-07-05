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
