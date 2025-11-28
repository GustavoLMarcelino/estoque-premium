import api from "./api";

export const MovSomAPI = {
  async listar({ produto_id, page = 1, pageSize = 20 } = {}) {
    const params = {};
    if (produto_id) params.produto_id = produto_id;
    params.page = page; params.pageSize = pageSize;
    const { data } = await api.get("/movimentacoes-som", { params });
    return Array.isArray(data) ? data : (data?.data ?? []);
  },
  async criar({ produto_id, tipo, quantidade, valor_final }) {
    const payload = { produto_id, tipo, quantidade };
    if (valor_final != null && valor_final !== "") payload.valor_final = Number(valor_final).toFixed(2);
    const { data } = await api.post("/movimentacoes-som", payload);
    return data;
  },
  async remover(id) {
    await api.delete(`/movimentacoes-som/${id}`);
  },
};
