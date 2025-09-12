import api from "./api";

export const EstoqueAPI = {
  async listar({ q = "" } = {}) {
    const { data } = await api.get("/estoque", { params: { q } });
    const items = Array.isArray(data) ? data : (data?.data ?? []);
    return items;
  },
  async obter(id) {
    const { data } = await api.get(`/estoque/${id}`);
    return data;
  },
  async criar(payload) {
    const { data } = await api.post("/estoque", payload);
    return data;
  },
  async atualizar(id, payload) {
    const { data } = await api.put(`/estoque/${id}`, payload);
    return data;
  },
  async remover(id) {
    await api.delete(`/estoque/${id}`);
  },
};
