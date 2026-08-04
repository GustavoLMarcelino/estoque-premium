import api from "./api";

export const VendasResumoAPI = {
  // As três faces (total, baterias, som) vêm numa chamada só — o toggle do
  // dashboard alterna a face sem tocar na API de novo (mesmo desenho do
  // carrossel da Home com /estoque-resumo/custo).
  //
  // Bloco null = linha fora do escopo do usuário: a face nem é oferecida.
  // custoVendido/lucroBruto/lucroLiquido só vêm para quem pode ver custo —
  // ausência do campo é "não pode ver", NÃO zero.
  async resumo() {
    const { data } = await api.get("/vendas-resumo");
    return data?.data ?? null;
  },
};
