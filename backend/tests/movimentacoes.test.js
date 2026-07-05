import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

const produtoBase = {
  produto: 'Bateria Mov',
  modelo: 'BM-60',
  custo: '100.00',
  valor_venda: '150.00',
  qtd_minima: 1,
  qtd_inicial: 10, // disponível inicial = 10
  entradas: 0,
  saidas: 0,
};

let produtoId;

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque.deleteMany();
  produtoId = (await prisma.estoque.create({ data: produtoBase })).id;
});

const criarMov = (body, auth = authAdmin()) =>
  request(app).post('/api/movimentacoes').set(auth).send(body);

describe('POST /api/movimentacoes — transação de estoque', () => {
  it('saída maior que o disponível → 409, sem efeito colateral', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'saida', quantidade: 11 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/excede/i);
    expect(await prisma.movimentacoes.count()).toBe(0);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(0);
  });

  it('saída igual ao disponível (limite exato) → 201', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'saida', quantidade: 10 });
    expect(res.status).toBe(201);
  });

  it('entrada atualiza o agregado entradas', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 5 });
    expect(res.status).toBe(201);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.entradas).toBe(5);
    expect(p.saidas).toBe(0);
  });

  it('saída atualiza o agregado saidas e grava vendedor/valor unitário', async () => {
    const res = await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 4, valor_final: '151.64', vendedor: 'Ismael',
    });
    expect(res.status).toBe(201);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(4);
    const mov = await prisma.movimentacoes.findFirst();
    expect(mov.tipo).toBe('SAIDA');
    expect(mov.vendedor).toBe('Ismael');
    expect(Number(mov.valor_final)).toBeCloseTo(151.64, 2);
  });

  it('usuário comum pode registrar movimentação (POST liberado)', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 1 }, authUser());
    expect(res.status).toBe(201);
  });
});

describe('DELETE /api/movimentacoes/:id — reversão de agregados e autorização', () => {
  it('excluir uma ENTRADA reverte o agregado entradas (admin → 204)', async () => {
    const mov = (await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 5 })).body;
    const res = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(res.status).toBe(204);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.entradas).toBe(0);
    expect(await prisma.movimentacoes.count()).toBe(0);
  });

  it('excluir uma SAÍDA reverte o agregado saidas (admin → 204)', async () => {
    const mov = (await criarMov({ produto_id: produtoId, tipo: 'saida', quantidade: 3 })).body;
    const res = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(res.status).toBe(204);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(0);
  });

  it('usuário comum não pode excluir → 403 e nada muda', async () => {
    const mov = (await criarMov({ produto_id: produtoId, tipo: 'saida', quantidade: 3 })).body;
    const res = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authUser());
    expect(res.status).toBe(403);
    expect(await prisma.movimentacoes.count()).toBe(1);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(3);
  });
});
