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
  // qtdContada omitida = "bateu" (o backend grava qtd_contada = qtd_sistema).
  // Informada = contagem real do conferente ("Divergiu").
  conferir: async (itemId, qtdContada) => {
    const body = qtdContada === undefined || qtdContada === null || qtdContada === ""
      ? undefined
      : { qtd_contada: Number(qtdContada) };
    const { data } = await api.patch(`/inventario/item/${itemId}/conferir`, body);
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
  // { page, pageSize, total, pages, data: [...] } — lista simples da linha,
  // aberta ao operador.
  historico: async (linha, { page = 1, pageSize = 20 } = {}) => {
    const { data } = await api.get(`/inventario/${linha}/historico`, { params: { page, pageSize } });
    return data;
  },
  // Histórico COMPLETO (as duas linhas + divergências + quem finalizou).
  // Restrito a admin — o backend responde 403 para os demais.
  historicoCompleto: async ({ page = 1, pageSize = 50 } = {}) => {
    const { data } = await api.get('/inventario/historico', { params: { page, pageSize } });
    return data;
  },
};
