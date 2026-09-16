// src/services/reauthBridge.js
// Ponte entre o interceptor do axios (módulo comum, fora da árvore React) e o
// <ReauthModal> (componente React). O interceptor não pode usar useContext,
// então o modal se registra aqui ao montar; o interceptor só chama a função.
let handler = null;

export function setReauthHandler(fn) {
  handler = fn;
}

/** Pede reautenticação e resolve com o token novo (ou rejeita se cancelado). */
export function requestReauth() {
  if (!handler) return Promise.reject(new Error("ReauthModal não está montado."));
  return handler();
}
