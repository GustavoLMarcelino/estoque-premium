import api from "./api";
import { todasAsPaginas } from "./apiFactories";

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

  /** TODAS as garantias da busca, iterando as páginas.
   *
   *  Não existe um `listar` de página única ao lado: um método que traz parte
   *  da lista, com um pageSize default qualquer, é a armadilha que produziu
   *  este bug. Quando a tela precisar paginar de verdade, o método nasce com o
   *  envelope na assinatura.
   *
   *  A tela filtra por status no cliente, sobre a lista que recebeu. Trazer só
   *  uma página faria o filtro "FINALIZADA" mostrar apenas as finalizadas
   *  daquela página e chamar isso de resultado — pior que paginar, porque
   *  parece completo. Antes esta chamada pedia pageSize 200, que é exatamente o
   *  teto da rota: funcionava por coincidência e sumiria em silêncio na 201ª. */
  listarTodas: async ({ q = "" } = {}) => todasAsPaginas("/garantias", { q }, 200),

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
