import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

let produtoId;

beforeEach(async () => {
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque_som.deleteMany();
  const marca = await prisma.marca.upsert({ where: { nome: 'Acdelco' }, update: {}, create: { nome: 'Acdelco' } });
  produtoId = (
    await prisma.estoque_som.create({
      data: {
        produto: 'Alto-falante', modelo: 'AF-6', marca_id: marca.id, custo: '80.00', valor_venda: '150.00',
        qtd_minima: 1, qtd_inicial: 10, entradas: 0, saidas: 0,
      },
    })
  ).id;
});

const criarPedido = (itens, auth = authAdmin()) =>
  request(app).post('/api/pedido-som').set(auth).send({ veiculo: 'Gol', forma_pagamento: 'pix', itens });

describe('POST /api/pedido-som — comissão e baixa de estoque', () => {
  it('comissão do Joel = 30% da mão de obra; total soma produto + mão de obra', async () => {
    const res = await criarPedido([
      { tipo: 'MAO_OBRA', descricao: 'Instalação som', valor_unit: 300 },
      { tipo: 'PRODUTO', produto_id: produtoId, quantidade: 2, valor_unit: 150 },
    ]);
    expect(res.status).toBe(201);
    const pedido = res.body.data;
    expect(Number(pedido.valor_mao_obra)).toBe(300);
    expect(Number(pedido.comissao_joel)).toBe(90); // 30% de 300
    expect(Number(pedido.valor_total)).toBe(600); // 300 mão de obra + 2×150
    expect(pedido.itens).toHaveLength(2);
  });

  it('pedido só com produto não gera mão de obra nem comissão', async () => {
    const res = await criarPedido([{ tipo: 'PRODUTO', produto_id: produtoId, quantidade: 1, valor_unit: 150 }]);
    expect(res.status).toBe(201);
    expect(res.body.data.valor_mao_obra).toBeNull();
    expect(res.body.data.comissao_joel).toBeNull();
  });

  it('item PRODUTO dá baixa no estoque e registra movimentação com motivo do pedido', async () => {
    const res = await criarPedido([{ tipo: 'PRODUTO', produto_id: produtoId, quantidade: 2, valor_unit: 150 }]);
    const pedidoId = res.body.data.id;
    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(2);
    const mov = await prisma.movimentacoes_som.findFirst();
    expect(mov.tipo).toBe('SAIDA');
    expect(mov.quantidade).toBe(2);
    expect(mov.motivo).toBe(`Pedido Som #${pedidoId}`);
  });

  it('estoque insuficiente → 409 e transação inteira desfeita (sem pedido, sem baixa)', async () => {
    const res = await criarPedido([{ tipo: 'PRODUTO', produto_id: produtoId, quantidade: 99, valor_unit: 150 }]);
    expect(res.status).toBe(409);
    expect(await prisma.pedido_som.count()).toBe(0);
    expect(await prisma.movimentacoes_som.count()).toBe(0);
    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(0);
  });
});

describe('DELETE /api/pedido-som/:id — reversão e autorização', () => {
  it('admin exclui pedido do dia: baixa revertida, movimentações e comissão removidas', async () => {
    const res = await criarPedido([
      { tipo: 'MAO_OBRA', descricao: 'Instalação', valor_unit: 300 },
      { tipo: 'PRODUTO', produto_id: produtoId, quantidade: 2, valor_unit: 150 },
    ]);
    const pedidoId = res.body.data.id;

    const del = await request(app).delete(`/api/pedido-som/${pedidoId}`).set(authAdmin());
    expect(del.status).toBe(204);

    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(0); // baixa revertida
    expect(await prisma.movimentacoes_som.count()).toBe(0); // movs do pedido removidas
    // pedido (e com ele a comissão registrada) não existe mais
    expect(await prisma.pedido_som.findUnique({ where: { id: pedidoId } })).toBeNull();
    expect(await prisma.pedido_som_item.count()).toBe(0);
  });

  it('usuário comum não pode excluir pedido → 403 e nada muda', async () => {
    const res = await criarPedido([{ tipo: 'PRODUTO', produto_id: produtoId, quantidade: 1, valor_unit: 150 }]);
    const pedidoId = res.body.data.id;

    const del = await request(app).delete(`/api/pedido-som/${pedidoId}`).set(authUser());
    expect(del.status).toBe(403);
    expect(await prisma.pedido_som.count()).toBe(1);
    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(1);
  });
});
