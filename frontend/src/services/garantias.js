import api from "./api";

export const GarantiasAPI = {
  criar: async (payload) => {
    const { data } = await api.post("/garantias", payload);
    return data;
  },

  obter: async (id) => {
    const { data } = await api.get(`/garantias/${id}`);
    return data;
  },

  listar: async ({ q = "", page = 1, pageSize = 200 } = {}) => {
    const { data } = await api.get("/garantias", { params: { q, page, pageSize } });
    return data; // { page, pageSize, total, pages, data: [...] }
  },
};
