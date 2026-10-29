import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Config separada do vite.config.js de propósito: o VitePWA (service worker,
// manifest) não tem utilidade nos testes e só deixaria a suíte mais lenta.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Módulo virtual gerado pelo VitePWA, que não roda nos testes.
      'virtual:pwa-register/react': fileURLToPath(new URL('./tests/stubs/pwa-register-react.js', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    // npm run test:coverage. Entra tudo de src/, menos o ponto de entrada
    // (main.jsx só monta o React no DOM) e os arquivos de tipo. Abaixo de 30%
    // de linhas o comando falha (a meta do projeto é 25%; 30% dá folga).
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.jsx', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: { lines: 30 },
    },
  },
})
