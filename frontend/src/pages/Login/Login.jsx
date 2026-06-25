import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Eye, EyeOff, ArrowLeft, Mail, Lock } from "lucide-react";
import { AuthAPI } from "../../services/auth";
import logoSemFundo from "../../assets/LogoSemFundo.png";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("loginRememberEmail");
    if (saved) {
      setEmail(saved);
      setLembrar(true);
    }
  }, []);

  const emailValido = useMemo(() => /\S+@\S+\.\S+/.test(email), [email]);

  function handleCaps(e) {
    const has = e.getModifierState && e.getModifierState("CapsLock");
    setCapsOn(Boolean(has));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");

    if (!emailValido) { setErro("Insira um e-mail válido."); return; }
    if (!senha)       { setErro("Informe sua senha.");        return; }

    try {
      setLoading(true);
      const resp = await AuthAPI.login({ email, password: senha });
      localStorage.setItem("token", resp.token);
      localStorage.setItem("usuarioLogado", JSON.stringify(resp.user));

      if (lembrar) localStorage.setItem("loginRememberEmail", email);
      else         localStorage.removeItem("loginRememberEmail");

      navigate("/home", { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Falha ao entrar";
      setErro(msg);
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full h-12 rounded-2xl bg-white/5 text-white placeholder-white/30 " +
    "border border-white/10 outline-none transition-all duration-150 " +
    "focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30";

  return (
    <main
      className="relative min-h-screen text-white flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)" }}
    >
      {/* Voltar */}
      <div className="h-16 flex items-center px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors text-sm font-medium"
          aria-label="Voltar para a landing"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start sm:items-center justify-center px-4 pb-8">
        {/* Glow + Card wrapper */}
        <div className="relative w-full max-w-md">
          {/* Ambient amber glow */}
          <div
            className="absolute inset-0 -z-10 scale-110 rounded-3xl blur-3xl"
            style={{ background: "radial-gradient(ellipse at center, rgba(251,191,36,0.12) 0%, transparent 70%)" }}
          />

          {/* Card */}
          <div
            className="rounded-2xl border border-amber-400/50 bg-[#111] p-8 md:p-10"
            style={{ boxShadow: "0 0 60px rgba(251,191,36,0.12), 0 20px 40px rgba(0,0,0,0.5)" }}
          >
            {/* Logo */}
            <img
              src={logoSemFundo}
              alt="Premium Baterias"
              className="mx-auto mb-6 h-16 object-contain"
            />

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-extrabold text-center">Entrar</h1>
            <p className="mt-2 text-center text-white/60 text-sm">
              Acesse o painel do <span className="font-semibold text-white/80">Estoque Premium</span>
            </p>

            {/* Error */}
            {erro && (
              <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {erro}
              </div>
            )}

            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              {/* E-mail */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold mb-2 text-white/80">
                  E-mail
                </label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none"
                  />
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyUp={handleCaps}
                    placeholder="seu@email.com"
                    className={`${inputCls} pl-10 pr-4`}
                  />
                </div>
              </div>

              {/* Senha */}
              <div>
                <label htmlFor="senha" className="block text-sm font-semibold mb-2 text-white/80">
                  Senha
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none"
                  />
                  <input
                    id="senha"
                    type={showPwd ? "text" : "password"}
                    autoComplete="current-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    onKeyUp={handleCaps}
                    placeholder="••••••••"
                    className={`${inputCls} pl-10 pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                    aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {capsOn && (
                  <p className="mt-2 text-xs text-amber-300">Caps Lock está ativado.</p>
                )}
              </div>

              {/* Lembrar / Esqueci */}
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={lembrar}
                    onChange={(e) => setLembrar(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-transparent accent-amber-400 focus:ring-amber-400"
                  />
                  <span className="text-sm text-white/70">Lembrar de mim</span>
                </label>

                <a
                  href="#"
                  className="text-sm text-white/50 hover:text-amber-400 transition-colors"
                >
                  Esqueci minha senha
                </a>
              </div>

              {/* Entrar */}
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full
                           bg-gradient-to-r from-amber-400 to-yellow-400 py-3 text-base
                           font-bold text-slate-900 shadow-lg transition-all duration-150
                           hover:from-amber-300 hover:to-yellow-300 hover:scale-[1.02]
                           hover:shadow-amber-400/25 hover:shadow-xl
                           disabled:opacity-60 disabled:scale-100"
              >
                <LogIn className="w-5 h-5" />
                {loading ? "Entrando…" : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-white/25">
        © Premium Baterias — Deus é fiel
      </footer>
    </main>
  );
}
