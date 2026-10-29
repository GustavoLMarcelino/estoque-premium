import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // setup.js roda antes dos imports de CADA arquivo de teste (isolate padrão):
    // cria um SQLite temporário exclusivo por arquivo — nunca toca dev.db/produção.
    setupFiles: ['./tests/setup.js'],
    testTimeout: 20000,
    hookTimeout: 30000,
    // npm run test:coverage. Só src/ entra na conta (scripts/ e prisma/ são
    // utilitários de linha de comando, fora da API). Abaixo de 75% de linhas
    // o comando falha.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text-summary', 'html'],
      thresholds: { lines: 75 },
    },
  },
});
