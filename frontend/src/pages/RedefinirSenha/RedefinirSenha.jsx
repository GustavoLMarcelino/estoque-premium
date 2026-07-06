import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock, ArrowLeft, KeyRound } from "lucide-react";
import { AuthAPI } from "../../services/auth";

const inputCls =
  "w-full h-12 rounded-2xl bg-white/5 text-white placeholder-white/30 " +
  "border border-white/10 outline-none transition-all duration-150 " +
  "focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30";

export default function RedefinirSenha() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (senha.length < 8) { setErro("A nova senha deve ter pelo menos 8 caracteres."); return; }
    if (senha !== confirmacao) { setErro("As senhas não conferem."); return; }
    try {
      setLoading(true);
      await AuthAPI.redefinirSenha({ token, senha });
      navigate("/login", { replace: true, state: { info: "Senha redefinida com sucesso. Faça login com a nova senha." } });
    } catch (err) {
      setErro(err?.response?.data?.message || err?.message || "Falha ao redefinir a senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="relative min-h-screen text-white flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)" }}
    >
      <div className="h-16 flex items-center px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate("/login")}
          className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para o login
        </button>
      </div>

      <div className="flex-1 flex items-start sm:items-center justify-center px-4 pb-8">
        <div className="relative w-full max-w-md">
          <div
            className="rounded-2xl border border-amber-400/50 bg-[#111] p-8 md:p-10"
            style={{ boxShadow: "0 0 60px rgba(251,191,36,0.12), 0 20px 40px rgba(0,0,0,0.5)" }}
          >
            <h1 className="text-2xl md:text-3xl font-extrabold text-center">Redefinir senha</h1>

            {!token ? (
              <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-4 text-sm text-red-300">
                Link inválido: o token de redefinição não foi encontrado. Solicite um novo em
                {" "}<button className="underline text-amber-300" onClick={() => navigate("/esqueci-senha")}>esqueci minha senha</button>.
              </div>
            ) : (
              <>
                <p className="mt-2 text-center text-white/60 text-sm">
                  Escolha a nova senha da sua conta (mínimo de 8 caracteres).
                </p>

                {erro && (
                  <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {erro}
                  </div>
                )}

                <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Nova senha"
                      className={`${inputCls} pl-10 pr-4`}
                    />
                  </div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirmacao}
                      onChange={(e) => setConfirmacao(e.target.value)}
                      placeholder="Confirme a nova senha"
                      className={`${inputCls} pl-10 pr-4`}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-full
                               bg-gradient-to-r from-amber-400 to-yellow-400 py-3 text-base
                               font-bold text-slate-900 shadow-lg transition-all duration-150
                               hover:from-amber-300 hover:to-yellow-300 disabled:opacity-60"
                  >
                    <KeyRound className="w-5 h-5" />
                    {loading ? "Salvando…" : "Redefinir senha"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
