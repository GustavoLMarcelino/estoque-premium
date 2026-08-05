import api from "./api";

export const VendasResumoAPI = {
  // As três faces (total, baterias, som) vêm numa chamada só — o toggle do
  // dashboard alterna a face sem tocar na API de novo (mesmo desenho do
  // carrossel da Home com /estoque-resumo/custo).
  //
  // Bloco null = linha fora do escopo do usuário: a face nem é oferecida.
  // custoVendido/lucroBruto/lucroLiquido só vêm para quem pode ver custo —
  // ausência do campo é "não pode ver", NÃO zero.
  // from/to são OPCIONAIS (Date ou string ISO/YYYY-MM-DD). Omitidos, agrega
  // todo o histórico — é como o Dashboard chama, e o payload é o de sempre.
  async resumo({ from, to } = {}) {
    const params = {};
    if (from) params.from = from instanceof Date ? from.toISOString() : from;
    if (to) params.to = to instanceof Date ? to.toISOString() : to;
    const { data } = await api.get("/vendas-resumo", { params });
    return data?.data ?? null;
  },
};
