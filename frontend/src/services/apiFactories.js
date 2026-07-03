import api from "./api";

// Fábricas de clientes de API: evitam duplicar o mesmo CRUD para cada recurso
// (estoque/estoque-som, movimentacoes/movimentacoes-som).

// CRUD padrão de um recurso de estoque.
export function createEstoqueAPI(basePath) {
  return {
    // Retorna a lista COMPLETA do recurso: o backend pagina com teto de 100,
    // então itera as páginas até o fim (sem isso, telas que dependem da lista
    // inteira — estoque, dropdown de lançamento, tabela de preços — só viam
    // os primeiros 10 itens).
    async listar({ q = "", tipo } = {}) {
      const pageSize = 100;
      const { data } = await api.get(basePath, { params: { q, tipo, page: 1, pageSize } });
      if (Array.isArray(data)) return data;
      const all = [...(data?.data ?? [])];
      const pages = Number(data?.pages) || 1;
      for (let page = 2; page <= pages; page++) {
        const { data: d } = await api.get(basePath, { params: { q, tipo, page, pageSize } });
        all.push(...(d?.data ?? []));
      }
      return all;
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
    // Lista com envelope de paginação: { page, pageSize, total, pages, data }
    async listarPagina({ q = "", produto_id, page = 1, pageSize = 20 } = {}) {
      const params = { page, pageSize };
      if (q) params.q = q;
      if (produto_id) params.produto_id = produto_id;
      const { data } = await api.get(basePath, { params });
      return data;
    },
    async criar({ produto_id, tipo, quantidade, valor_final, vendedor }) {
      const payload = { produto_id, tipo, quantidade };
      if (valor_final != null && valor_final !== "") {
        payload.valor_final = Number(valor_final).toFixed(2);
      }
      if (vendedor) payload.vendedor = vendedor;
      const { data } = await api.post(basePath, payload);
      return data;
    },
    async remover(id) {
      await api.delete(`${basePath}/${id}`);
    },
  };
}
