import api from "./api";
import { createMovAPI } from "./apiFactories";

export const MovAPI = {
  ...createMovAPI("/movimentacoes"),
  // Fila de conferência de vendas de Baterias (Som tem a sua em PedidoSomAPI).
  async listarPendencias({ page = 1, pageSize = 20 } = {}) {
    const { data } = await api.get("/movimentacoes/pendencias-verificacao", { params: { page, pageSize } });
    return data;
  },
  async conferir(id) {
    const { data } = await api.patch(`/movimentacoes/${id}/conferir`);
    return data?.data ?? data;
  },
};
