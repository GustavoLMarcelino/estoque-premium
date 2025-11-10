# Premium Landing (importada do Lovable)

**O que é isso?**  
Cópia 1:1 do projeto `premium-power-page-main` (Lovable), integrada no app sem afetar as outras rotas.

## Estrutura
- `assets/` — imagens e ícones (ex.: `hero-workshop.jpg`, `logo.png`)
- `components/` — seções da landing (Header, Services, Coverage, LogoBar, Footer, FinalCTA, Testimonials)
- `components/ui/` — biblioteca de UI (shadcn + radix wrappers: button, input, tooltip, toaster, etc.)
- `hooks/` — hooks utilitários (detecção de mobile, toast)
- `lib/` — helpers (`utils.ts`, função `cn`, etc.)
- `pages/` — páginas da landing (`Index.tsx`, `NotFound.tsx`)
- `index.css` — Tailwind base, tokens e variáveis (marca PRETO/BRANCO/AMARELO)
- `App.css` — estilos complementares

## Como é carregada
A rota `/premium` usa `src/pages/Premium/PremiumWrapper.jsx`, que:
- importa `@/index.css` (Tailwind) e `@/App.css` da landing
- injeta providers (React Query, Tooltip, Toaster, Sonner)
- renderiza `@/pages/Index`

> Observação: não criamos um novo `BrowserRouter` aqui para não colidir com o roteamento já existente do sistema.
