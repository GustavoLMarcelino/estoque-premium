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
  // Fase C: edita só o cabeçalho (veículo, forma, parcelas). O backend recusa
  // qualquer outra chave — itens, valor e data não passam por aqui.
  atualizar: async (id, payload) => {
    const { data } = await api.put(`/pedido-som/${id}`, payload);
    return data?.data ?? data;
  },
  obter: async (id) => {
    const { data } = await api.get(`/pedido-som/${id}`);
    return data?.data ?? data;
  },
  remover: async (id) => {
    await api.delete(`/pedido-som/${id}`);
  },
};
