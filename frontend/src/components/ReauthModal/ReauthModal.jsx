// src/components/ReauthModal/ReauthModal.jsx
// Sessão expirou em pleno uso (token de 8h venceu): em vez do redirect duro
// pro /login que descartava o formulário em andamento, pede a senha aqui
// mesmo e retoma a requisição original depois de reautenticar.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Loader2 } from "lucide-react";
import { AuthAPI, salvarSessao, getUsuarioLogado } from "../../services/auth";
import { setReauthHandler } from "../../services/reauthBridge";

export default function ReauthModal() {
  const [open, setOpen] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);
  // Vários 401 podem chegar juntos (várias chamadas em voo quando o token
  // vence) — todos esperam o MESMO modal/resultado, sem abrir um por request.
  const pendentesRef = useRef([]);

  const abrir = useCallback(() => {
    return new Promise((resolve, reject) => {
      pendentesRef.current.push({ resolve, reject });
      setErro("");
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    setReauthHandler(abrir);
    return () => setReauthHandler(null);
  }, [abrir]);

  function limparSessaoEIrParaLogin() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuarioLogado");
    localStorage.removeItem("role");
    localStorage.removeItem("permissoes");
    if (window.location.pathname !== "/login") window.location.assign("/login");
  }

  function cancelar() {
    const pendentes = pendentesRef.current;
    pendentesRef.current = [];
    setOpen(false);
    setSenha("");
    limparSessaoEIrParaLogin();
    pendentes.forEach(({ reject }) => reject(new Error("Reautenticação cancelada.")));
  }

  async function confirmar(e) {
    e.preventDefault();
    const email = getUsuarioLogado()?.email;
    if (!email) return cancelar(); // sem sessão salva pra reautenticar, nada a fazer aqui

    try {
      setEntrando(true);
      setErro("");
      const { token, user } = await AuthAPI.login({ email, password: senha });
      localStorage.setItem("token", token);
      salvarSessao(user);

      const pendentes = pendentesRef.current;
      pendentesRef.current = [];
      setOpen(false);
      setSenha("");
      pendentes.forEach(({ resolve }) => resolve(token));
    } catch (err) {
      setErro(err?.response?.data?.message || "Senha incorreta.");
    } finally {
      setEntrando(false);
    }
  }

  if (!open) return null;

  const email = getUsuarioLogado()?.email || "";

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-800 p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-full bg-amber-500/15 p-2 text-amber-400">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Sessão expirada</h3>
            <p className="mt-1 text-sm text-slate-300">
              Digite sua senha para continuar de onde parou — o que você já preencheu não será perdido.
            </p>
          </div>
        </div>

        <form onSubmit={confirmar} className="mt-4 space-y-3">
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-300">{email}</span>
            <input
              autoFocus
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Sua senha"
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
            />
            {erro && <p className="mt-1.5 text-sm text-red-400">{erro}</p>}
          </div>

          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={cancelar}
              className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-500"
            >
              Sair
            </button>
            <button
              type="submit"
              disabled={entrando || !senha}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-400 disabled:opacity-60"
            >
              {entrando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continuar
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
