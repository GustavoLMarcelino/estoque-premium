import api from "./api";

// Fábricas de clientes de API: evitam duplicar o mesmo CRUD para cada recurso
// (estoque/estoque-som, movimentacoes/movimentacoes-som).

/** Lista COMPLETA de uma rota paginada, iterando até a última página.
 *
 *  Toda rota de listagem do backend tem teto de pageSize (100, ou 200 em
 *  garantias) e o clamp é aplicado em silêncio: pedir 500 devolve 100 sem
 *  nenhum aviso. Quem precisa da lista inteira tem que paginar — pedir um
 *  número grande e torcer é justamente o bug que sumiu com produto de Som na
 *  Home e escondeu R$ 20 mil no card de valor total.
 *
 *  Mora aqui, exportada, porque três serviços precisam do mesmo laço: estoque,
 *  garantias e pedidos de Som. */
export async function todasAsPaginas(basePath, params = {}, pageSize = 100) {
  const { data } = await api.get(basePath, { params: { ...params, page: 1, pageSize } });
  if (Array.isArray(data)) return data; // rota sem envelope
  const todos = [...(data?.data ?? [])];
  const pages = Number(data?.pages) || 1;
  for (let page = 2; page <= pages; page++) {
    const { data: d } = await api.get(basePath, { params: { ...params, page, pageSize } });
    todos.push(...(d?.data ?? []));
  }
  return todos;
}

// CRUD padrão de um recurso de estoque.
export function createEstoqueAPI(basePath) {
  return {
    // Lista COMPLETA: sem isso, telas que dependem do catálogo inteiro —
    // estoque, dropdown de lançamento, tabela de preços — só viam os primeiros
    // 10 itens.
    async listar({ q = "", tipo } = {}) {
      return todasAsPaginas(basePath, { q, tipo });
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
    //
    // status_pagamento filtra NO BACKEND, e tem que ser assim: a tela pagina de
    // 20 em 20, então filtrar o que já foi buscado esconderia todo fiado que
    // não estivesse na página aberta — e o rodapé continuaria contando a lista
    // inteira. Só /movimentacoes conhece o campo; em Som o param é ignorado.
    async listarPagina({ q = "", produto_id, status_pagamento, page = 1, pageSize = 20 } = {}) {
      const params = { page, pageSize };
      if (q) params.q = q;
      if (produto_id) params.produto_id = produto_id;
      if (status_pagamento) params.status_pagamento = status_pagamento;
      const { data } = await api.get(basePath, { params });
      return data;
    },
    async criar({
      produto_id, tipo, quantidade, valor_final, vendedor,
      forma_pagamento, parcelas, custo, valor_vista, valor_parcelado,
      status_pagamento, cliente_fiado,
    }) {
      const payload = { produto_id, tipo, quantidade };
      if (valor_final != null && valor_final !== "") {
        payload.valor_final = Number(valor_final).toFixed(2);
      }
      if (vendedor) payload.vendedor = vendedor;
      // Sem estas duas a venda chegava sem forma de pagamento e o dashboard
      // calculava taxa R$ 0 — taxa subestimada, lucro superestimado.
      if (forma_pagamento) payload.forma_pagamento = forma_pagamento;
      if (parcelas != null && parcelas !== "") payload.parcelas = Number(parcelas);
      // Venda fiado: sem estas duas o "FIADO" montado na tela era DESCARTADO
      // aqui — este método remonta o payload do zero a partir da desestruturação
      // acima, então chave que não está na lista some em silêncio. A venda
      // nascia PAGO, sem erro nenhum, e só dava para perceber lançando de fato.
      if (status_pagamento) payload.status_pagamento = status_pagamento;
      if (cliente_fiado) payload.cliente_fiado = cliente_fiado;
      // Entrada pode repor o custo e corrigir os preços — vai tudo junto para
      // o backend gravar numa transação só (nada de PUT separado depois).
      for (const [k, v] of Object.entries({ custo, valor_vista, valor_parcelado })) {
        if (v != null && v !== "") payload[k] = Number(v).toFixed(2);
      }
      const { data } = await api.post(basePath, payload);
      return data;
    },
    // Edição de venda (só Baterias hoje: /movimentacoes tem PUT, o de Som não).
    // Manda SÓ o que mudou — o backend trata chave ausente como "não mexe", e o
    // .strict() dele recusa qualquer campo fora do contrato.
    async atualizar(id, payload) {
      const { data } = await api.put(`${basePath}/${id}`, payload);
      return data?.data ?? data;
    },
    async remover(id) {
      await api.delete(`${basePath}/${id}`);
    },
  };
}
