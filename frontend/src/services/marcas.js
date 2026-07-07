import api from "./api";

export const MarcasAPI = {
  /** Ativas (dropdown). `todas: true` inclui desativadas (tela de gestão). */
  listar: async ({ todas = false } = {}) => {
    const { data } = await api.get("/marcas", { params: todas ? { todas: 1 } : {} });
    return data.data;
  },
  criar: async (nome) => {
    const { data } = await api.post("/marcas", { nome });
    return data;
  },
  atualizar: async (id, payload) => {
    const { data } = await api.patch(`/marcas/${id}`, payload);
    return data;
  },
};
