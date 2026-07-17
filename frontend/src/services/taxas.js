import api from "./api";

// Cliente da config de taxas de maquininha (singleton no banco).
// Leitura: qualquer autenticado. Escrita: admin (backend faz o enforcement).
export const TaxasAPI = {
  getConfig: async () => {
    const { data } = await api.get("/taxas/config");
    return data.data;
  },
  salvarConfig: async (payload) => {
    const { data } = await api.put("/taxas/config", payload);
    return data.data;
  },
};
