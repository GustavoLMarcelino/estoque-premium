// src/components/ui/ConfirmDialog.jsx
// Modal de confirmação reutilizável + provider e hook useConfirm.
// useConfirm() retorna uma função `confirm(options) => Promise<boolean>`,
// permitindo substituir window.confirm() sem reescrever a lógica de negócio:
//   const ok = await confirm({ title, message, confirmLabel });
//   if (!ok) return;
import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

const ConfirmContext = createContext(null);

const DEFAULTS = {
  title: "Confirmar",
  message: "Deseja continuar?",
  confirmLabel: "Confirmar",
  cancelLabel: "Cancelar",
  tone: "danger", // 'danger' | 'default'
};

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({ open: false, options: DEFAULTS });
  const [show, setShow] = useState(false);
  const resolverRef = useRef(null);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ open: true, options: { ...DEFAULTS, ...options } });
    });
  }, []);

  const close = useCallback((result) => {
    setShow(false);
    setTimeout(() => {
      setState((s) => ({ ...s, open: false }));
      if (resolverRef.current) {
        resolverRef.current(result);
        resolverRef.current = null;
      }
    }, 200);
  }, []);

  // animação de entrada
  useEffect(() => {
    if (!state.open) return undefined;
    const r = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(r);
  }, [state.open]);

  // ESC cancela
  useEffect(() => {
    if (!state.open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.open, close]);

  const { title, message, confirmLabel, cancelLabel, tone } = state.options;
  const confirmClasses =
    tone === "danger"
      ? "bg-[var(--cp-signal-red)] hover:brightness-110 text-white"
      : "bg-[var(--cp-volt)] hover:brightness-105 text-[var(--cp-volt-ink)]";
  const accentClasses =
    tone === "danger"
      ? "bg-[var(--cp-signal-red)]/15 text-[var(--cp-signal-red)]"
      : "bg-[var(--cp-volt)]/15 text-[var(--cp-volt)]";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state.open &&
        createPortal(
          <div
            className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 transition-opacity duration-200 ${
              show ? "opacity-100" : "opacity-0"
            }`}
            onMouseDown={() => close(false)}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => e.stopPropagation()}
              className={[
                "relative w-full max-w-sm rounded-[var(--cp-r-2xl)] border-[length:var(--cp-bw-12)] border-[var(--cp-confirm-border)] bg-[var(--cp-confirm-bg)] p-6 shadow-2xl",
                "transition-all duration-200 ease-out",
                show ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <div className={`shrink-0 rounded-full p-2 ${accentClasses}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-lg font-extrabold text-[var(--cp-confirm-title)]">{title}</h3>
                  {/* whitespace-pre-line: as mensagens já separam parágrafos
                      com \n\n, e sem isto o HTML colapsa tudo num bloco só. */}
                  <p className="mt-1 whitespace-pre-line text-sm text-[var(--cp-confirm-msg)]">{message}</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-[var(--cp-r-lg)] border-[length:var(--cp-bw-cancel)] border-[var(--cp-line)] bg-[var(--cp-confirm-cancel-bg)] px-4 py-2 text-sm font-semibold text-[var(--cp-confirm-cancel-text)] hover:bg-[var(--cp-confirm-cancel-hover)] transition-colors"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => close(true)}
                  className={`font-display rounded-[var(--cp-r-lg)] border-[length:var(--cp-bw-02)] border-[var(--cp-ink)] px-4 py-2 text-sm font-extrabold transition-colors ${confirmClasses}`}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm deve ser usado dentro de <ConfirmProvider>");
  return ctx;
}
