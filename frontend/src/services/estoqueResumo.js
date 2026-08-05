import api from "./api";

export const EstoqueResumoAPI = {
  // Os três valores (total, baterias, som) vêm numa chamada só — o carrossel da
  // Home alterna a face sem tocar na API de novo.
  async custo() {
    const { data } = await api.get("/estoque-resumo/custo");
    return data?.data ?? null;
  },

  // Σ (preço de venda × em estoque). Mesmo formato do custo, mesma vantagem: as
  // três faces numa chamada. Somado no servidor porque /api/estoque corta o
  // pageSize em 100 — somar no cliente perdia produto sem avisar.
  async venda() {
    const { data } = await api.get("/estoque-resumo/venda");
    return data?.data ?? null;
  },

  // Produtos com saldo <= quantidade mínima: { total, baterias, som }, cada um
  // { quantidade, itens[] }. A lista vem junto porque o modal precisa dela — e
  // são os críticos, não o catálogo inteiro.
  async criticos() {
    const { data } = await api.get("/estoque-resumo/criticos");
    return data?.data ?? null;
  },
};
