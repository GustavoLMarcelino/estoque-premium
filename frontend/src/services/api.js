import axios from "axios";

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

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("usuarioLogado");
      // opcional redirecionar ou notificar
    }
    return Promise.reject(error);
  }
);

export default api;
