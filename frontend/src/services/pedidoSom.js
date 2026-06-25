import api from "./api";

// Cliente da API de Pedidos de Instalação de Som.
export const PedidoSomAPI = {
  criar: async (payload) => {
    const { data } = await api.post("/pedido-som", payload);
    return data?.data ?? data;
  },
  // { page, pageSize, total, pages, data }
  listar: async ({ page = 1, pageSize = 20 } = {}) => {
    const { data } = await api.get("/pedido-som", { params: { page, pageSize } });
    return data;
  },
  obter: async (id) => {
    const { data } = await api.get(`/pedido-som/${id}`);
    return data?.data ?? data;
  },
  remover: async (id) => {
    await api.delete(`/pedido-som/${id}`);
  },
};
