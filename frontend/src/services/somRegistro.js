import api from "./api";

// Cliente do Registro de Movimentação do Som (pedidos + avulsas por dia).
export const SomRegistroAPI = {
  /** Um bloco de até 31 dias, do mais recente para o mais antigo.
   *  Devolve { dias, proximoAte, resumoPeriodo }. */
  async buscar({ de, ate, filtro, q }) {
    const params = { de, ate };
    if (filtro && filtro !== "tudo") params.filtro = filtro;
    if (q) params.q = q;
    const { data } = await api.get("/som/registro", { params });
    return data;
  },
};
