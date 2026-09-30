import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

// GET /api/movimentacoes/pendencias-verificacao e PATCH /:id/conferir — a fila
// onde o admin bate as vendas de não-admin contra o extrato do banco.

let produtoId;

const criarVenda = (dados = {}) =>
  prisma.movimentacoes.create({
    data: {
      produto_id: produtoId, tipo: 'SAIDA', quantidade: 1, valor_final: '150.00',
      forma_pagamento: 'pix', vendedor: 'Ismael',
      data_movimentacao: new Date('2026-08-10T12:00:00Z'),
      user_id: 2, created_by: 'user@teste.local',
      ...dados,
    },
  });

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque.deleteMany();
  const marca = await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } });
  produtoId = (await prisma.estoque.create({
    data: {
      produto: 'Bateria Fila', modelo: 'BF-60', marca_id: marca.id,
      custo: '100.00', valor_venda: '150.00', qtd_minima: 1, qtd_inicial: 50,
    },
  })).id;
});

const listarPendencias = (auth = authAdmin()) =>
  request(app).get('/api/movimentacoes/pendencias-verificacao').set(auth);

const conferir = (id, auth = authAdmin()) =>
  request(app).patch(`/api/movimentacoes/${id}/conferir`).set(auth);

describe('GET /api/movimentacoes/pendencias-verificacao', () => {
  it('lista só as pendentes, não as conferidas nem as sem pendência (admin)', async () => {
    const pendente = await criarVenda({ status_verificacao: 'pendente' });
    await criarVenda({ status_verificacao: 'conferido', data_verificacao: new Date(), verificado_por_user_id: 1, verificado_por: 'admin@teste.local' });
    await criarVenda({ status_verificacao: null });

    const { status, body } = await listarPendencias();
    expect(status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(pendente.id);
  });

  it('traz o produto/modelo via include', async () => {
    await criarVenda({ status_verificacao: 'pendente' });
    const { body } = await listarPendencias();
    expect(body.data[0].estoque.produto).toBe('Bateria Fila');
    expect(body.data[0].estoque.modelo).toBe('BF-60');
  });

  it('não-admin: 403', async () => {
    const res = await listarPendencias(authUser());
    expect(res.status).toBe(403);
  });

  it('sem pendências: lista vazia, total 0', async () => {
    const { status, body } = await listarPendencias();
    expect(status).toBe(200);
    expect(body.total).toBe(0);
    expect(body.data).toEqual([]);
  });

  it('respeita paginação (envelope page/pages/total)', async () => {
    for (let i = 0; i < 3; i++) {
      await criarVenda({ status_verificacao: 'pendente', data_movimentacao: new Date(2026, 7, 10 + i) });
    }
    const { body } = await request(app)
      .get('/api/movimentacoes/pendencias-verificacao?pageSize=2')
      .set(authAdmin());
    expect(body.total).toBe(3);
    expect(body.pages).toBe(2);
    expect(body.data).toHaveLength(2);
  });
});

describe('PATCH /api/movimentacoes/:id/conferir', () => {
  it('marca conferido e registra quem/quando (admin)', async () => {
    const mov = await criarVenda({ status_verificacao: 'pendente' });
    const antes = Date.now();

    const { status, body } = await conferir(mov.id);
    expect(status).toBe(200);
    expect(body.data.status_verificacao).toBe('conferido');
    expect(body.data.verificado_por_user_id).toBe(1);
    expect(body.data.verificado_por).toBe('admin@teste.local');
    expect(new Date(body.data.data_verificacao).getTime()).toBeGreaterThanOrEqual(antes - 1000);

    const depois = await prisma.movimentacoes.findUnique({ where: { id: mov.id } });
    expect(depois.status_verificacao).toBe('conferido');
  });

  it('sai da fila depois de conferida', async () => {
    const mov = await criarVenda({ status_verificacao: 'pendente' });
    await conferir(mov.id);
    const { body } = await listarPendencias();
    expect(body.total).toBe(0);
  });

  it('conferir de novo uma já conferida: 409', async () => {
    const mov = await criarVenda({ status_verificacao: 'pendente' });
    await conferir(mov.id);
    const res = await conferir(mov.id);
    expect(res.status).toBe(409);
  });

  it('conferir uma venda sem pendência (null, venda de admin): 409', async () => {
    const mov = await criarVenda({ status_verificacao: null });
    const res = await conferir(mov.id);
    expect(res.status).toBe(409);
  });

  it('movimentação inexistente: 404', async () => {
    const res = await conferir(999999);
    expect(res.status).toBe(404);
  });

  it('não-admin: 403, nada muda', async () => {
    const mov = await criarVenda({ status_verificacao: 'pendente' });
    const res = await conferir(mov.id, authUser());
    expect(res.status).toBe(403);
    expect((await prisma.movimentacoes.findUnique({ where: { id: mov.id } })).status_verificacao).toBe('pendente');
  });
});
