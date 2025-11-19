import api from "./api";

export const EstoqueSomAPI = {
  async listar({ q = "", tipo } = {}) {
    const { data } = await api.get("/estoque-som", { params: { q, tipo } });
    return Array.isArray(data) ? data : (data?.data ?? []);
  },
  async obter(id) {
    const { data } = await api.get(`/estoque-som/${id}`);
    return data;
  },
  async criar(payload) {
    const { data } = await api.post("/estoque-som", payload);
    return data;
  },
  async atualizar(id, payload) {
    const { data } = await api.put(`/estoque-som/${id}`, payload);
    return data;
  },
  async remover(id) {
    await api.delete(`/estoque-som/${id}`);
  },
};
