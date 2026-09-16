// src/components/ui/Toast.jsx
// Toast de notificação reutilizável + provider e hook useToast.
// Sem dependências externas além de react / lucide-react (já no projeto).
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, X } from "lucide-react";

const ToastContext = createContext(null);

let idSeq = 0;

const TYPE_STYLES = {
  success: {
    icon: CheckCircle2,
    container: "bg-emerald-900 border-emerald-500/40",
    iconColor: "text-emerald-400",
    duration: 3000,
  },
  error: {
    icon: XCircle,
    container: "bg-red-950 border-red-500/40",
    iconColor: "text-red-400",
    duration: 4000,
  },
};

function ToastItem({ toast, onClose }) {
  const cfg = TYPE_STYLES[toast.type] || TYPE_STYLES.success;
  const Icon = cfg.icon;
  const [show, setShow] = useState(false);

  const handleClose = useCallback(() => {
    setShow(false);
    // aguarda a animação de saída antes de remover do DOM
    setTimeout(() => onClose(toast.id), 300);
  }, [onClose, toast.id]);

  useEffect(() => {
    const enter = requestAnimationFrame(() => setShow(true));
    const timer = setTimeout(handleClose, toast.duration ?? cfg.duration);
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(timer);
    };
  }, [handleClose, toast.duration, cfg.duration]);

  return (
    <div
      role="alert"
      className={[
        "pointer-events-auto flex items-start gap-3 w-80 max-w-[calc(100vw-2rem)]",
        "rounded-xl border px-4 py-3 shadow-lg text-white",
        "transition-all duration-300 ease-out",
        cfg.container,
        show ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0",
      ].join(" ")}
    >
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${cfg.iconColor}`} strokeWidth={2.2} />
      <p className="flex-1 text-sm leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={handleClose}
        aria-label="Fechar"
        className="shrink-0 text-white/60 hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type, message, duration) => {
    const id = ++idSeq;
    setToasts((list) => [...list, { id, type, message, duration }]);
    return id;
  }, []);

  const api = useMemo(
    () => ({
      success: (message, duration) => push("success", message, duration),
      error: (message, duration) => push("error", message, duration),
      show: push,
      dismiss: remove,
    }),
    [push, remove],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onClose={remove} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast deve ser usado dentro de <ToastProvider>");
  return ctx;
}
