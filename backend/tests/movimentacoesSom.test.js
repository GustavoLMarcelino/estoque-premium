import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

// Cobre a ENTRADA de estoque de Som (POST /api/movimentacoes-som, tipo 'entrada').
// É o caminho de reposição reexposto após d695bdc ter derrubado o modo Venda
// Simples de Som — lógica crítica de estoque, então travamos o incremento aqui.

let produtoId;

beforeEach(async () => {
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque_som.deleteMany();
  const marca = await prisma.marca.upsert({ where: { nome: 'JBL' }, update: {}, create: { nome: 'JBL' } });
  produtoId = (
    await prisma.estoque_som.create({
      data: {
        produto: 'Alto-falante Som', modelo: 'AF-6', marca_id: marca.id,
        custo: '80.00', valor_venda: '150.00', qtd_minima: 1,
        qtd_inicial: 10, entradas: 0, saidas: 0,
      },
    })
  ).id;
});

const criarMov = (body, auth = authAdmin()) =>
  request(app).post('/api/movimentacoes-som').set(auth).send(body);

describe('POST /api/movimentacoes-som — ENTRADA de estoque de Som', () => {
  it('entrada incrementa o agregado entradas (estoque atual sobe)', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 5 });
    expect(res.status).toBe(201);
    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.entradas).toBe(5);
    expect(p.saidas).toBe(0);
    // estoque atual exibido = qtd_inicial + entradas - saidas → 10 + 5 - 0 = 15
    expect(Number(p.qtd_inicial) + Number(p.entradas) - Number(p.saidas)).toBe(15);
  });

  it('grava a movimentação com tipo ENTRADA e valor_final quando informado', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 3, valor_final: '99.90' });
    expect(res.status).toBe(201);
    const mov = await prisma.movimentacoes_som.findFirst();
    expect(mov.tipo).toBe('ENTRADA');
    expect(mov.quantidade).toBe(3);
    expect(Number(mov.valor_final)).toBeCloseTo(99.9, 2);
  });

  it('valor_final ausente ainda dá entrada (campo é opcional)', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 2 });
    expect(res.status).toBe(201);
    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.entradas).toBe(2);
  });

  it('quantidade <= 0 → 400 e nenhum efeito colateral', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 0 });
    expect(res.status).toBe(400);
    expect(await prisma.movimentacoes_som.count()).toBe(0);
    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.entradas).toBe(0);
  });

  it('operador com escopo de Som também pode dar entrada (POST liberado)', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 1 }, authUser());
    expect(res.status).toBe(201);
    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.entradas).toBe(1);
  });
});
