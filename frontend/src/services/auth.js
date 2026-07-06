import api from "./api";

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

export const AuthAPI = {
  async login({ email, password }) {
    const { data } = await api.post("/auth/login", { email, password });
    return data;
  },
  async register({ name, email, password, role }) {
    const { data } = await api.post("/auth/register", { name, email, password, role });
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
