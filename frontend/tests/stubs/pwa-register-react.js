// Substituto do módulo virtual "virtual:pwa-register/react" (gerado pelo
// VitePWA, que não participa dos testes). Os testes que precisam de um
// comportamento específico usam vi.mock('virtual:pwa-register/react', ...).
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: () => {},
  }
}
