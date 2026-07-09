import api from "./api";

export const GarantiasAPI = {
  criar: async (payload) => {
    const { data } = await api.post("/garantias", payload);
    return data;
  },

  obter: async (id) => {
    const { data } = await api.get(`/garantias/${id}`);
    return data;
  },

  atualizar: async (id, payload) => {
    const { data } = await api.patch(`/garantias/${id}`, payload);
    return data;
  },

  listar: async ({ q = "", page = 1, pageSize = 200 } = {}) => {
    const { data } = await api.get("/garantias", { params: { q, page, pageSize } });
    return data; // { page, pageSize, total, pages, data: [...] }
  },

  /** Baterias emprestadas agora (empréstimo ativo não devolvido). */
  emprestimosAtivos: async () => {
    const { data } = await api.get("/garantias/emprestimos-ativos");
    return data.data; // [{ garantia_id, cliente_nome, produto, marca, quantidade, desde }]
  },

  deletar: async (id) => {
    const { data } = await api.delete(`/garantias/${id}`);
    return data;
  },

  devolver: async (id) => {
    const { data } = await api.patch(`/garantias/${id}/devolver`);
    return data; // { error, message, data }
  },

  finalizar: async (id) => {
    const { data } = await api.patch(`/garantias/${id}/finalizar`);
    return data; // { error, message, data }
  },
};
