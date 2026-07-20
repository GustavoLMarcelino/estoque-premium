import api from "./api";

export const EstoqueResumoAPI = {
  // Os três valores (total, baterias, som) vêm numa chamada só — o carrossel da
  // Home alterna a face sem tocar na API de novo.
  async custo() {
    const { data } = await api.get("/estoque-resumo/custo");
    return data?.data ?? null;
  },
};
