import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // setup.js roda antes dos imports de CADA arquivo de teste (isolate padrão):
    // cria um SQLite temporário exclusivo por arquivo — nunca toca dev.db/produção.
    setupFiles: ['./tests/setup.js'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
