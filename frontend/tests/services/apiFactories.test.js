import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import api from '../../src/services/api.js';
import { todasAsPaginas, createEstoqueAPI, createMovAPI } from '../../src/services/apiFactories.js';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('todasAsPaginas', () => {
  it('junta as páginas até a última, pedindo cada uma pelo número', async () => {
    api.get
      .mockResolvedValueOnce({ data: { data: [{ id: 1 }, { id: 2 }], pages: 3 } })
      .mockResolvedValueOnce({ data: { data: [{ id: 3 }], pages: 3 } })
      .mockResolvedValueOnce({ data: { data: [{ id: 4 }], pages: 3 } });

    const todos = await todasAsPaginas('/estoque', { q: 'moura' }, 2);

    expect(todos.map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(api.get).toHaveBeenNthCalledWith(1, '/estoque', { params: { q: 'moura', page: 1, pageSize: 2 } });
    expect(api.get).toHaveBeenNthCalledWith(3, '/estoque', { params: { q: 'moura', page: 3, pageSize: 2 } });
  });

  it('com uma página só, faz uma única requisição', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 1 }], pages: 1 } });
    expect(await todasAsPaginas('/marcas')).toEqual([{ id: 1 }]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('rota sem envelope (resposta já é array) é devolvida como veio', async () => {
    api.get.mockResolvedValue({ data: [{ id: 9 }] });
    expect(await todasAsPaginas('/x')).toEqual([{ id: 9 }]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('resposta sem "data" nem "pages" vira lista vazia, sem quebrar', async () => {
    api.get.mockResolvedValue({ data: {} });
    expect(await todasAsPaginas('/x')).toEqual([]);
  });

  it('usa pageSize 100 por padrão', async () => {
    api.get.mockResolvedValue({ data: { data: [], pages: 1 } });
    await todasAsPaginas('/x');
    expect(api.get).toHaveBeenCalledWith('/x', { params: { page: 1, pageSize: 100 } });
  });
});

describe('createEstoqueAPI', () => {
  const estoque = createEstoqueAPI('/estoque-som');

  it('listar traz o catálogo inteiro, repassando busca e tipo', async () => {
    api.get
      .mockResolvedValueOnce({ data: { data: [{ id: 1 }], pages: 2 } })
      .mockResolvedValueOnce({ data: { data: [{ id: 2 }], pages: 2 } });
    const lista = await estoque.listar({ q: 'jbl', tipo: 'som' });
    expect(lista).toHaveLength(2);
    expect(api.get.mock.calls[0][1].params).toMatchObject({ q: 'jbl', tipo: 'som' });
  });

  it('obter, criar, atualizar e remover usam o caminho e o verbo certos', async () => {
    api.get.mockResolvedValue({ data: { id: 5 } });
    api.post.mockResolvedValue({ data: { id: 6 } });
    api.put.mockResolvedValue({ data: { id: 5, produto: 'X' } });
    api.delete.mockResolvedValue({});

    expect(await estoque.obter(5)).toEqual({ id: 5 });
    expect(api.get).toHaveBeenCalledWith('/estoque-som/5');
    expect(await estoque.criar({ produto: 'A' })).toEqual({ id: 6 });
    expect(api.post).toHaveBeenCalledWith('/estoque-som', { produto: 'A' });
    expect(await estoque.atualizar(5, { produto: 'X' })).toEqual({ id: 5, produto: 'X' });
    expect(api.put).toHaveBeenCalledWith('/estoque-som/5', { produto: 'X' });
    expect(await estoque.remover(5)).toBeUndefined();
    expect(api.delete).toHaveBeenCalledWith('/estoque-som/5');
  });
});

describe('createMovAPI — listagens', () => {
  const mov = createMovAPI('/movimentacoes');

  it('listar aceita resposta em array ou com envelope', async () => {
    api.get.mockResolvedValueOnce({ data: [{ id: 1 }] });
    expect(await mov.listar()).toEqual([{ id: 1 }]);
    api.get.mockResolvedValueOnce({ data: { data: [{ id: 2 }] } });
    expect(await mov.listar()).toEqual([{ id: 2 }]);
    api.get.mockResolvedValueOnce({ data: {} });
    expect(await mov.listar()).toEqual([]);
  });

  it('listar só manda produto_id quando informado', async () => {
    api.get.mockResolvedValue({ data: [] });
    await mov.listar();
    expect(api.get).toHaveBeenLastCalledWith('/movimentacoes', { params: { page: 1, pageSize: 20 } });
    await mov.listar({ produto_id: 7, page: 2, pageSize: 5 });
    expect(api.get).toHaveBeenLastCalledWith('/movimentacoes', { params: { page: 2, pageSize: 5, produto_id: 7 } });
  });

  it('listarPagina omite filtros vazios e devolve o envelope inteiro', async () => {
    const envelope = { page: 1, pageSize: 20, total: 1, pages: 1, data: [{ id: 1 }] };
    api.get.mockResolvedValue({ data: envelope });
    expect(await mov.listarPagina()).toEqual(envelope);
    expect(api.get).toHaveBeenLastCalledWith('/movimentacoes', { params: { page: 1, pageSize: 20 } });
  });

  it('listarPagina manda busca, produto e status de pagamento para o backend filtrar', async () => {
    api.get.mockResolvedValue({ data: {} });
    await mov.listarPagina({ q: 'joão', produto_id: 3, status_pagamento: 'FIADO', page: 4 });
    expect(api.get).toHaveBeenLastCalledWith('/movimentacoes', {
      params: { page: 4, pageSize: 20, q: 'joão', produto_id: 3, status_pagamento: 'FIADO' },
    });
  });
});

describe('createMovAPI — criar', () => {
  const mov = createMovAPI('/movimentacoes');

  beforeEach(() => {
    api.post.mockResolvedValue({ data: { id: 1 } });
  });

  it('entrada simples manda só produto, tipo e quantidade', async () => {
    await mov.criar({ produto_id: 1, tipo: 'entrada', quantidade: 5 });
    expect(api.post).toHaveBeenCalledWith('/movimentacoes', { produto_id: 1, tipo: 'entrada', quantidade: 5 });
  });

  it('valor_final vira string com duas casas decimais', async () => {
    await mov.criar({ produto_id: 1, tipo: 'saida', quantidade: 1, valor_final: 151.6 });
    expect(api.post.mock.calls[0][1].valor_final).toBe('151.60');
  });

  it('valor_final vazio ou nulo não entra no payload', async () => {
    await mov.criar({ produto_id: 1, tipo: 'saida', quantidade: 1, valor_final: '' });
    await mov.criar({ produto_id: 1, tipo: 'saida', quantidade: 1, valor_final: null });
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('valor_final');
    expect(api.post.mock.calls[1][1]).not.toHaveProperty('valor_final');
  });

  it('valor_final zero é enviado (zero é um valor válido, não ausência)', async () => {
    await mov.criar({ produto_id: 1, tipo: 'saida', quantidade: 1, valor_final: 0 });
    expect(api.post.mock.calls[0][1].valor_final).toBe('0.00');
  });

  it('venda com forma de pagamento: manda forma, parcelas numéricas e vendedor', async () => {
    await mov.criar({
      produto_id: 1, tipo: 'saida', quantidade: 1, valor_final: 100,
      vendedor: 'Ismael', forma_pagamento: 'credito', parcelas: '3',
    });
    expect(api.post.mock.calls[0][1]).toMatchObject({
      vendedor: 'Ismael', forma_pagamento: 'credito', parcelas: 3,
    });
  });

  it('venda fiado leva status_pagamento e cliente_fiado (não podem ser descartados)', async () => {
    await mov.criar({
      produto_id: 1, tipo: 'saida', quantidade: 1,
      status_pagamento: 'FIADO', cliente_fiado: 'Seu Zé',
    });
    expect(api.post.mock.calls[0][1]).toMatchObject({ status_pagamento: 'FIADO', cliente_fiado: 'Seu Zé' });
  });

  it('entrada com reposição de custo e preços manda os três com duas casas', async () => {
    await mov.criar({
      produto_id: 1, tipo: 'entrada', quantidade: 10,
      custo: 200, valor_vista: '310.5', valor_parcelado: 350,
    });
    expect(api.post.mock.calls[0][1]).toMatchObject({
      custo: '200.00', valor_vista: '310.50', valor_parcelado: '350.00',
    });
  });

  it('campos de preço em branco não entram no payload', async () => {
    await mov.criar({ produto_id: 1, tipo: 'entrada', quantidade: 1, custo: '', valor_vista: undefined });
    const payload = api.post.mock.calls[0][1];
    expect(payload).not.toHaveProperty('custo');
    expect(payload).not.toHaveProperty('valor_vista');
  });

  it('devolve o corpo da resposta', async () => {
    api.post.mockResolvedValue({ data: { id: 42 } });
    expect(await mov.criar({ produto_id: 1, tipo: 'entrada', quantidade: 1 })).toEqual({ id: 42 });
  });
});

describe('createMovAPI — atualizar e remover', () => {
  const mov = createMovAPI('/movimentacoes');

  it('atualizar desembrulha { data } quando o backend envelopa', async () => {
    api.put.mockResolvedValue({ data: { data: { id: 1, quantidade: 3 } } });
    expect(await mov.atualizar(1, { quantidade: 3 })).toEqual({ id: 1, quantidade: 3 });
    expect(api.put).toHaveBeenCalledWith('/movimentacoes/1', { quantidade: 3 });
  });

  it('atualizar devolve a resposta crua quando não há envelope', async () => {
    api.put.mockResolvedValue({ data: { id: 1 } });
    expect(await mov.atualizar(1, {})).toEqual({ id: 1 });
  });

  it('remover chama DELETE no id', async () => {
    api.delete.mockResolvedValue({});
    await mov.remover(8);
    expect(api.delete).toHaveBeenCalledWith('/movimentacoes/8');
  });
});
