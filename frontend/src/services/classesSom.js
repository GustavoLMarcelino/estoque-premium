import api from "./api";

// Classes de serviço do Estoque Som (carregam o valor fixo de mão de obra).
export const ClassesSomAPI = {
  /** Ativas (dropdown). `todas: true` inclui desativadas (tela de gestão).
   *  `categoria: 'SOM'|'INSULFILME'` filtra por categoria. */
  listar: async ({ todas = false, categoria } = {}) => {
    const params = {};
    if (todas) params.todas = 1;
    if (categoria) params.categoria = categoria;
    const { data } = await api.get("/classes-som", { params });
    return data.data;
  },
  criar: async ({ nome, valor_mao_obra, categoria }) => {
    const { data } = await api.post("/classes-som", { nome, valor_mao_obra, categoria });
    return data;
  },
  atualizar: async (id, payload) => {
    const { data } = await api.patch(`/classes-som/${id}`, payload);
    return data;
  },
};
