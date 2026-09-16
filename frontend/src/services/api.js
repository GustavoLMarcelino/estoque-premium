import axios from "axios";
import { requestReauth } from "./reauthBridge";

const envUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, "");
const inferredUrl =
  typeof window !== "undefined" ? `${window.location.origin.replace(/\/+$/, "")}/api` : undefined;
// Prefer explicit env; fall back to same-origin /api (for static hosting with reverse proxy); default to localhost.
const baseURL = envUrl || inferredUrl || "http://localhost:3000/api";

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Chamadas do próprio fluxo de auth nunca disparam reautenticação (senão a
// senha errada no login, ou no próprio modal de reautenticação, reabriria o
// modal em cima de si mesma).
const isAuthCall = (url = "") => /\/auth\/(login|esqueci-senha|redefinir-senha)/.test(url);

function limparSessaoEIrParaLogin() {
  localStorage.removeItem("token");
  localStorage.removeItem("usuarioLogado");
  localStorage.removeItem("role");
  localStorage.removeItem("permissoes");
  if (window.location.pathname !== "/login") window.location.assign("/login");
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const status = error?.response?.status;
    const config = error?.config;
    const tinhaSessao = !!localStorage.getItem("token");

    // 401 de credenciais erradas no /login não tem sessão prévia e não deve
    // recarregar a página — deixa o formulário de login tratar o próprio erro.
    if (status !== 401 || !tinhaSessao || isAuthCall(config?.url)) {
      return Promise.reject(error);
    }

    // Sessão expirada em pleno uso: pede a senha de novo (sem navegar pra
    // fora da tela) e reenvia a MESMA requisição que falhou, uma única vez.
    if (!config._reauthRetry) {
      config._reauthRetry = true;
      try {
        await requestReauth(); // resolve quando o token novo já está no localStorage
        return api(config); // o interceptor de request acima pega o token novo
      } catch {
        limparSessaoEIrParaLogin();
        return Promise.reject(error);
      }
    }

    // Reautenticou e MESMO ASSIM veio 401 de novo (ex.: usuário excluído
    // entre a reautenticação e o retry) — aí sim é sessão morta de vez.
    limparSessaoEIrParaLogin();
    return Promise.reject(error);
  }
);

export default api;
