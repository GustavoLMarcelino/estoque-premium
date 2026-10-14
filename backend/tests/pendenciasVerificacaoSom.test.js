import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

// Fila de conferência dos pedidos de Som: mesma regra de Baterias
// (pendencias-verificacao.test.js), só que em pedido_som.

const criarPedido = (dados = {}) =>
  prisma.pedido_som.create({
    data: {
      veiculo: 'Gol', valor_total: '500.00', forma_pagamento: 'PIX',
      user_id: 2, created_by: 'user@teste.local',
      ...dados,
    },
  });

beforeEach(async () => {
  await prisma.pedido_som.deleteMany();
});

const listar = (auth = authAdmin()) =>
  request(app).get('/api/pedido-som/pendencias-verificacao').set(auth);
const conferir = (id, auth = authAdmin()) =>
  request(app).patch(`/api/pedido-som/${id}/conferir`).set(auth);

describe('GET /api/pedido-som/pendencias-verificacao', () => {
  it('lista só os pendentes (admin)', async () => {
    const pendente = await criarPedido({ status_verificacao: 'pendente' });
    await criarPedido({ status_verificacao: 'conferido' });
    await criarPedido({ status_verificacao: null });

    const { status, body } = await listar();
    expect(status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.data[0].id).toBe(pendente.id);
  });

  it('não-admin: 403', async () => {
    expect((await listar(authUser())).status).toBe(403);
  });
});

describe('PATCH /api/pedido-som/:id/conferir', () => {
  it('marca conferido e registra quem/quando', async () => {
    const p = await criarPedido({ status_verificacao: 'pendente' });
    const { status, body } = await conferir(p.id);
    expect(status).toBe(200);
    expect(body.data.status_verificacao).toBe('conferido');
    expect(body.data.verificado_por).toBe('admin@teste.local');
    expect((await listar()).body.total).toBe(0);
  });

  it('já conferido ou sem pendência: 409', async () => {
    const conferido = await criarPedido({ status_verificacao: 'conferido' });
    const semFila = await criarPedido({ status_verificacao: null });
    expect((await conferir(conferido.id)).status).toBe(409);
    expect((await conferir(semFila.id)).status).toBe(409);
  });

  it('inexistente: 404; não-admin: 403', async () => {
    expect((await conferir(999999)).status).toBe(404);
    const p = await criarPedido({ status_verificacao: 'pendente' });
    expect((await conferir(p.id, authUser())).status).toBe(403);
  });
});

describe('PUT /api/pedido-som/:id reabre a fila', () => {
  it('trocar a forma de pagamento de um pedido conferido volta a pendente', async () => {
    const p = await criarPedido({
      status_verificacao: 'conferido', data_verificacao: new Date(),
      verificado_por_user_id: 1, verificado_por: 'admin@teste.local',
    });
    const res = await request(app).put(`/api/pedido-som/${p.id}`).set(authAdmin())
      .send({ forma_pagamento: 'Dinheiro' });
    expect(res.status).toBe(200);
    const depois = await prisma.pedido_som.findUnique({ where: { id: p.id } });
    expect(depois.status_verificacao).toBe('pendente');
    expect(depois.verificado_por).toBeNull();
  });
});

describe('POST /api/pedido-som — status de verificação na criação', () => {
  const lancar = (auth) =>
    request(app).post('/api/pedido-som').set(auth).send({
      veiculo: 'Gol', forma_pagamento: 'PIX',
      itens: [{ tipo: 'MAO_OBRA', descricao: 'Instalação', valor_unit: 200 }],
    });

  it('não-admin lança: nasce pendente e entra na fila', async () => {
    const res = await lancar(authUser());
    expect(res.status).toBe(201);
    expect(res.body.data.status_verificacao).toBe('pendente');
    expect((await listar()).body.total).toBe(1);
  });

  it('admin lança: fica fora da fila (null)', async () => {
    const res = await lancar(authAdmin());
    expect(res.status).toBe(201);
    expect(res.body.data.status_verificacao).toBeNull();
    expect((await listar()).body.total).toBe(0);
  });
});

describe('PUT /api/pedido-som/:id — o que não reabre a fila', () => {
  it('editar só o veículo de um pedido conferido mantém a conferência', async () => {
    const quando = new Date('2026-10-01T12:00:00Z');
    const p = await criarPedido({
      status_verificacao: 'conferido', data_verificacao: quando,
      verificado_por_user_id: 1, verificado_por: 'admin@teste.local',
    });
    const res = await request(app).put(`/api/pedido-som/${p.id}`).set(authAdmin())
      .send({ veiculo: 'Uno' });
    expect(res.status).toBe(200);
    const depois = await prisma.pedido_som.findUnique({ where: { id: p.id } });
    expect(depois.veiculo).toBe('Uno');
    expect(depois.status_verificacao).toBe('conferido');
    expect(depois.verificado_por).toBe('admin@teste.local');
    expect(depois.data_verificacao.getTime()).toBe(quando.getTime());
  });
});
