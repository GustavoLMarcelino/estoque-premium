import api from "./api";

// Previsão pré-calculada do StockMind (regressão linear + classificador),
// gerada sob demanda pelo script Python na EC2. Leitura: admin-only
// (backend faz o enforcement).
export const StockMindAPI = {
  getPrevisao: async () => {
    const { data } = await api.get("/stockmind/previsao");
    return data;
  },
};
