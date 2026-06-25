import api from "./api";

// Cliente da API de Inventário de Estoque (linha = "BATERIAS" | "SOM").
export const InventarioAPI = {
  // Conferência EM_ANDAMENTO da linha (ou null).
  ativa: async (linha) => {
    const { data } = await api.get(`/inventario/${linha}/ativa`);
    return data?.data ?? null;
  },
  // Inicia nova conferência (snapshot dos produtos). 409 se já houver ativa.
  iniciar: async (linha) => {
    const { data } = await api.post(`/inventario/${linha}/iniciar`);
    return data?.data;
  },
  conferir: async (itemId) => {
    const { data } = await api.patch(`/inventario/item/${itemId}/conferir`);
    return data?.data;
  },
  desconferir: async (itemId) => {
    const { data } = await api.patch(`/inventario/item/${itemId}/desconferir`);
    return data?.data;
  },
  finalizar: async (conferenciaId) => {
    const { data } = await api.post(`/inventario/${conferenciaId}/finalizar`);
    return data?.data;
  },
  cancelar: async (conferenciaId) => {
    await api.delete(`/inventario/${conferenciaId}/cancelar`);
  },
  // { page, pageSize, total, pages, data: [...] }
  historico: async (linha, { page = 1, pageSize = 20 } = {}) => {
    const { data } = await api.get(`/inventario/${linha}/historico`, { params: { page, pageSize } });
    return data;
  },
};
