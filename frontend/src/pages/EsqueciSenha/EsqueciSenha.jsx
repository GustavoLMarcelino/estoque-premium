import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowLeft, SendHorizontal } from "lucide-react";
import { AuthAPI } from "../../services/auth";

const inputCls =
  "w-full h-12 rounded-2xl bg-white/5 text-white placeholder-white/30 " +
  "border border-white/10 outline-none transition-all duration-150 " +
  "focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30";

export default function EsqueciSenha() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");

  const emailValido = useMemo(() => /\S+@\S+\.\S+/.test(email), [email]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!emailValido) { setErro("Insira um e-mail válido."); return; }
    try {
      setLoading(true);
      await AuthAPI.esqueciSenha(email);
      setEnviado(true);
    } catch (err) {
      setErro(err?.response?.data?.message || err?.message || "Falha ao solicitar redefinição.");
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
            <h1 className="text-2xl md:text-3xl font-extrabold text-center">Esqueci minha senha</h1>

            {enviado ? (
              <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-300">
                Se esse email existir em nossa base, você receberá um link de redefinição.
                O link vale por 1 hora — confira também a caixa de spam.
              </div>
            ) : (
              <>
                <p className="mt-2 text-center text-white/60 text-sm">
                  Informe o email da sua conta e enviaremos um link para criar uma nova senha.
                </p>

                {erro && (
                  <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {erro}
                  </div>
                )}

                <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none" />
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
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
                    <SendHorizontal className="w-5 h-5" />
                    {loading ? "Enviando…" : "Enviar link de redefinição"}
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
