// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt': nunca troca a versão sozinho — o app avisa e quem está
      // usando decide quando recarregar (LancamentoEntradaSaida não pode
      // perder o formulário no meio de um lançamento).
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Estoque Premium',
        short_name: 'Estoque Premium',
        description: 'Gestão de estoque, vendas e garantias — Premium Baterias',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/home',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Só o app shell (JS/CSS/HTML/ícones) é pré-cacheado. Nenhuma rota
        // /api entra em cache — v1 é online-only, dado combinado (sem
        // fila de sincronização nem rascunho local no backend hoje).
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
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
