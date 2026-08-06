import api from "./api";
import { todasAsPaginas } from "./apiFactories";

// Cliente da API de Pedidos de Instalação de Som.
export const PedidoSomAPI = {
  criar: async (payload) => {
    const { data } = await api.post("/pedido-som", payload);
    return data?.data ?? data;
  },
  /** TODOS os pedidos, iterando as páginas.
   *
   *  O Registro de Movimentações não pagina os pedidos: ele os mescla por data
   *  com a primeira página de movimentações. Nessa mistura não existe "página
   *  2 de pedidos" — ou vêm todos, ou os mais antigos somem da tela sem aviso,
   *  que era o caso com o pageSize 50 fixo. */
  listarTodos: async () => todasAsPaginas("/pedido-som", {}, 100),
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
