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
      ? "bg-red-600 hover:bg-red-500 text-white"
      : "bg-amber-500 hover:bg-amber-400 text-slate-900";
  const accentClasses =
    tone === "danger"
      ? "bg-red-500/15 text-red-400"
      : "bg-amber-500/15 text-amber-400";

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
                "relative w-full max-w-sm rounded-2xl border border-white/10 bg-slate-800 p-6 shadow-2xl",
                "transition-all duration-200 ease-out",
                show ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <div className={`shrink-0 rounded-full p-2 ${accentClasses}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">{title}</h3>
                  <p className="mt-1 text-sm text-slate-300">{message}</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-500 transition-colors"
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => close(true)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${confirmClasses}`}
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
