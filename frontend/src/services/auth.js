import api from "./api";

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
};
