import api from "./api";
import { createMovAPI } from "./apiFactories";

export const MovAPI = {
  ...createMovAPI("/movimentacoes"),
  // Agregados de vendas para o dashboard (calculados no backend, sem truncar).
  async resumo() {
    const { data } = await api.get("/movimentacoes/resumo");
    return data?.data ?? null;
  },
};
