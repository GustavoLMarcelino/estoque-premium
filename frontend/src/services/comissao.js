import api from "./api";

// Cliente da API de comissões (config, painel do período atual e histórico).
export const ComissaoAPI = {
  painel: async () => {
    const { data } = await api.get("/comissao/painel");
    return data.data;
  },
  getConfig: async () => {
    const { data } = await api.get("/comissao/config");
    return data.data;
  },
  salvarConfig: async (payload) => {
    const { data } = await api.put("/comissao/config", payload);
    return data.data;
  },
  periodos: async () => {
    const { data } = await api.get("/comissao/periodos");
    return data.data;
  },
  periodo: async (id) => {
    const { data } = await api.get(`/comissao/periodos/${id}`);
    return data.data;
  },
};
