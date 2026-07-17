import api from "./api";
import { ROTAS_MODULO } from "../utils/permissoes";

// Papel do usuário logado. Prioriza a chave "role" (gravada no login); para
// sessões abertas antes dessa chave existir, cai no usuarioLogado salvo.
// Default seguro: "user" (nunca assumir admin).
export function getRole() {
  const direct = localStorage.getItem("role");
  if (direct) return direct;
  try {
    return JSON.parse(localStorage.getItem("usuarioLogado") || "null")?.role || "user";
  } catch {
    return "user";
  }
}

/** Usuário logado salvo na sessão (gravado no login e sincronizado via /me). */
export function getUsuarioLogado() {
  try {
    return JSON.parse(localStorage.getItem("usuarioLogado") || "null");
  } catch {
    return null;
  }
}

/** Permissões do usuário logado (gravadas no login e sincronizadas via /me).
 * Só UX — o enforcement real é o do backend. Chave ausente = false. */
export function getPermissoes() {
  try {
    const obj = JSON.parse(localStorage.getItem("permissoes") || "{}");
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

/** true se admin OU se QUALQUER uma das chaves está liberada (OR). */
export function temPermissao(...keys) {
  if (getRole() === "admin") return true;
  const perms = getPermissoes();
  return keys.some((k) => perms[k] === true);
}

/** true se o usuário opera a linha ('baterias'|'som'). Admin bypassa.
 *  Espelha podeVerLinha do backend — a chave no JSON é linha_<linha>. */
export function temLinha(linha) {
  if (getRole() === "admin") return true;
  return getPermissoes()[`linha_${linha}`] === true;
}

/** Uma tela de linha é visível se tem a permissão de tela E a linha. Telas
 *  sem linha (transversais/mistas) dependem só da permissão. */
export function podeVerTela(perm, linha) {
  if (!temPermissao(perm)) return false;
  return linha ? temLinha(linha) : true;
}

/** Primeira rota que o usuário pode abrir (ordem do sidebar); null = nenhuma. */
export function primeiraRotaPermitida() {
  if (getRole() === "admin") return "/home";
  const hit = ROTAS_MODULO.find(([, perm, linha]) => podeVerTela(perm, linha));
  return hit ? hit[0] : null;
}

/** Grava a sessão no localStorage (login e sync do /me). */
export function salvarSessao(user) {
  if (!user) return;
  localStorage.setItem("usuarioLogado", JSON.stringify(user));
  localStorage.setItem("role", user.role || "user");
  localStorage.setItem("permissoes", JSON.stringify(user.permissoes || {}));
}

export const AuthAPI = {
  async login({ email, password }) {
    const { data } = await api.post("/auth/login", { email, password });
    return data;
  },
  async me() {
    const { data } = await api.get("/auth/me");
    return data?.user;
  },
  async esqueciSenha(email) {
    const { data } = await api.post("/auth/esqueci-senha", { email });
    return data;
  },
  async redefinirSenha({ token, senha }) {
    const { data } = await api.post("/auth/redefinir-senha", { token, senha });
    return data;
  },
};
