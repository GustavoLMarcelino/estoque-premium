import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { AuthAPI } from "../../services/auth";

/**
 * Login – Premium Baterias
 * – Fundo preto, card com borda amarela (igual ao print)
 * – Inputs escuros, toggle de senha, lembrar de mim, esqueci
 * – Delay de 800ms, salva localStorage e navega /home
 * – Rodapé “© Premium Baterias — Deus é fiel”
 */
export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [erro, setErro] = useState("");

  // Preenche email salvo se o usuário marcou "lembrar de mim" antes
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

    if (!emailValido) {
      setErro("Insira um e-mail válido.");
      return;
    }
    if (!senha) {
      setErro("Informe sua senha.");
      return;
    }

    try {
      setLoading(true);
      const resp = await AuthAPI.login({ email, password: senha });
      localStorage.setItem("token", resp.token);
      localStorage.setItem("usuarioLogado", JSON.stringify(resp.user));

      if (lembrar) localStorage.setItem("loginRememberEmail", email);
      else localStorage.removeItem("loginRememberEmail");

      navigate("/home", { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Falha ao entrar";
      setErro(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* topo: voltar para landing */}
      <div className="h-16 flex items-center px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate("/premium")}
          className="inline-flex items-center gap-2 text-white hover:text-[#FFC400] transition-colors"
          aria-label="Voltar para a landing"
        >
          <ArrowLeft className="w-5 h-5" />
          Voltar
        </button>
      </div>

      {/* conteúdo central */}
      <div className="flex-1 flex items-start sm:items-center justify-center px-4">
        <div className="w-full max-w-xl rounded-2xl border-2 border-[#FFC400] bg-black p-8 md:p-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-center">Entrar</h1>
          <p className="mt-2 text-center !text-base max-xl:!text-xs text-white/80">
            Acesse o painel do <span className="font-semibold">Estoque Premium</span>
          </p>

          {erro && (
            <div className="mt-6 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {erro}
            </div>
          )}

          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
            {/* E-mail */}
            <div>
              <label htmlFor="email" className="block !text-base max-xl:!text-xs font-semibold mb-2">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyUp={handleCaps}
                placeholder="seu@email.com"
                className="w-full p-[8px] rounded-2xl bg-[#222] text-white placeholder-white/40 px-4 border border-transparent focus:border-[#FFC400] outline-none !text-base max-xl:!text-xs"
              />
            </div>

            {/* Senha */}
            <div>
              <label htmlFor="senha" className="block !text-base max-xl:!text-xs font-semibold mb-2">
                Senha
              </label>
              <div className="relative">
                <input
                  id="senha"
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  onKeyUp={handleCaps}
                  placeholder="••••••••"
                  className="w-full p-[8px] rounded-2xl bg-[#222] text-white placeholder-white/40 !text-base max-xl:!text-xs px-4 pr-12 border border-transparent focus:border-[#FFC400] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
                  aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {capsOn && (
                <div className="mt-2 text-xs text-yellow-300">Caps Lock está ativado.</div>
              )}
            </div>

            {/* Linha de ações pequenas */}
            <div className="flex gap-5 items-center justify-between">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={lembrar}
                  onChange={(e) => setLembrar(e.target.checked)}
                  className="rounded border-white/30 bg-transparent text-[#FFC400] focus:ring-[#FFC400]"
                />
                <span className="!text-base max-xl:!text-xs">Lembrar de mim</span>
              </label>

              <a
                href="#"
                className="!text-base max-xl:!text-xs text-white hover:text-[#FFC400] transition-colors"
              >
                Esqueci minha senha
              </a>
            </div>

            {/* Botão Entrar – pílula com borda amarela (print) */}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#FFC400] py-3 !text-base max-xl:!text-xs font-bold text-white transition-all hover:shadow-[0_0_0_3px_rgba(255,196,0,0.25)] disabled:opacity-60"
            >
              <LogIn className="w-5 h-5 max-xl:w-4" />
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>
      </div>

      {/* rodapé */}
      <footer className="py-8 text-center !text-sm max-xl:!text-xs text-white/70">
        © Premium Baterias — Deus é fiel
      </footer>
    </main>
  );
}
