import axios from "axios";

const baseURL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:3000/api";

const api = axios.create({ baseURL });

export default api;
