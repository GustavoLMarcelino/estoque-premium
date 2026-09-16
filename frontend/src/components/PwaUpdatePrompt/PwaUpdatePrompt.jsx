// src/components/PwaUpdatePrompt/PwaUpdatePrompt.jsx
// Aviso discreto de nova versão do PWA. Modo "prompt" (não autoUpdate):
// nunca recarrega sozinho — quem está no meio de um lançamento decide quando
// atualizar. Checa por versão nova quando a aba volta ao primeiro plano
// (troca de app no celular, volta de bloqueio de tela), não só no load.
import React, { useEffect } from "react";
import { RefreshCw, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

export default function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const checar = () => {
        if (document.visibilityState === "visible") registration.update();
      };
      document.addEventListener("visibilitychange", checar);
      window.addEventListener("focus", checar);
    },
    onRegisterError(error) {
      console.error("Falha ao registrar o service worker:", error);
    },
  });

  // Some sozinho se a aba ficar em segundo plano por muito tempo? Não —
  // fica até a pessoa agir, exatamente para não se perder no meio do uso.
  useEffect(() => {}, []);

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9998] flex justify-center px-4 pb-4 sm:justify-end sm:pr-6">
      <div className="flex w-full max-w-sm items-start gap-3 rounded-xl border border-amber-500/30 bg-slate-900 p-4 text-white shadow-xl">
        <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="flex-1 text-sm">
          <p className="font-semibold">Nova versão disponível</p>
          <p className="mt-0.5 text-slate-300">Atualize quando terminar o que estiver fazendo.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-amber-400"
            >
              Atualizar agora
            </button>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5"
            >
              Depois
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="Fechar aviso"
          className="shrink-0 text-slate-400 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
