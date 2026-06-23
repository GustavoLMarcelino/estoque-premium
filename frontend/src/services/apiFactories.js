import api from "./api";

// Fábricas de clientes de API: evitam duplicar o mesmo CRUD para cada recurso
// (estoque/estoque-som, movimentacoes/movimentacoes-som).

// CRUD padrão de um recurso de estoque.
export function createEstoqueAPI(basePath) {
  return {
    async listar({ q = "", tipo } = {}) {
      const { data } = await api.get(basePath, { params: { q, tipo } });
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
    async obter(id) {
      const { data } = await api.get(`${basePath}/${id}`);
      return data;
    },
    async criar(payload) {
      const { data } = await api.post(basePath, payload);
      return data;
    },
    async atualizar(id, payload) {
      const { data } = await api.put(`${basePath}/${id}`, payload);
      return data;
    },
    async remover(id) {
      await api.delete(`${basePath}/${id}`);
    },
  };
}

// Cliente de movimentações (entradas/saídas) de um recurso.
export function createMovAPI(basePath) {
  return {
    async listar({ produto_id, page = 1, pageSize = 20 } = {}) {
      const params = { page, pageSize };
      if (produto_id) params.produto_id = produto_id;
      const { data } = await api.get(basePath, { params });
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
    async criar({ produto_id, tipo, quantidade, valor_final }) {
      const payload = { produto_id, tipo, quantidade };
      if (valor_final != null && valor_final !== "") {
        payload.valor_final = Number(valor_final).toFixed(2);
      }
      const { data } = await api.post(basePath, payload);
      return data;
    },
    async remover(id) {
      await api.delete(`${basePath}/${id}`);
    },
  };
}
