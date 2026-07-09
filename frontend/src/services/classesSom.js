import api from "./api";

// Classes de serviço do Estoque Som (carregam o valor fixo de mão de obra).
export const ClassesSomAPI = {
  /** Ativas (dropdown). `todas: true` inclui desativadas (tela de gestão). */
  listar: async ({ todas = false } = {}) => {
    const { data } = await api.get("/classes-som", { params: todas ? { todas: 1 } : {} });
    return data.data;
  },
  criar: async ({ nome, valor_mao_obra }) => {
    const { data } = await api.post("/classes-som", { nome, valor_mao_obra });
    return data;
  },
  atualizar: async (id, payload) => {
    const { data } = await api.patch(`/classes-som/${id}`, payload);
    return data;
  },
};
