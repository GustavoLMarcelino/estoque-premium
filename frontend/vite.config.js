// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)), // ✅ agora "@/..." funciona
    },
  },
  server: {
    // Em dev o front roda no Vite (5173/5174) e a API no :3000.
    // O proxy faz "/api/*" apontar para o backend, mantendo a mesma origem.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
