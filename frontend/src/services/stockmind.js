import api from "./api";

// Formato do JSON gerado por stockmind/scripts/gerar_previsao_producao.py
// (SCHEMA_JSON). Mude os dois juntos.
const SCHEMA_ESPERADO = 2;

// Previsão pré-calculada do StockMind (regressão linear), gerada sob demanda
// pelo script Python na EC2, uma linha por GRUPO de bateria. Leitura:
// admin-only (backend faz o enforcement).
export const StockMindAPI = {
  getPrevisao: async () => {
    const { data } = await api.get("/stockmind/previsao");
    if (data?.schema !== SCHEMA_ESPERADO) {
      throw Object.assign(
        new Error("A previsão está em formato antigo — rode gerar_previsao_producao.py na EC2 para atualizá-la."),
        { code: "SCHEMA_ANTIGO" },
      );
    }
    return data;
  },
};

// Estoque parado (dias sem venda/entrada por SKU): calculado na hora pelo backend com o
// estoque e o custo de agora; só a última venda antiga vem do JSON da previsão.
export const EstoqueParadoAPI = {
  get: async () => {
    const { data } = await api.get("/stockmind/estoque-parado");
    if (!data?.resumo || !Array.isArray(data?.top)) {
      throw new Error("Resposta inesperada do estoque parado.");
    }
    return data;
  },
};

export function mensagemErroPrevisao(e) {
  if (e?.code === "SCHEMA_ANTIGO") return e.message;
  return e?.response?.data?.message || "Não foi possível carregar a previsão.";
}
