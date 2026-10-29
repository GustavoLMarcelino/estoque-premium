import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

describe("PUT /api/estoque — '' em valor_vista/valor_parcelado limpa para null", () => {
  let produtoId;

  beforeEach(async () => {
    await prisma.movimentacoes.deleteMany();
    await prisma.estoque.deleteMany();
    const marca = await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } });
    const res = await request(app)
      .post('/api/estoque')
      .set(authAdmin())
      .send({ produto: 'Bateria P', modelo: 'BP-60', marca_id: marca.id, custo: '100.00', valor_venda: '151.64', valor_vista: '151.64', valor_parcelado: '166.79' });
    expect(res.status).toBe(201);
    produtoId = res.body.id;
  });

  it("'' vira null (limpa o preço)", async () => {
    const res = await request(app)
      .put(`/api/estoque/${produtoId}`)
      .set(authAdmin())
      .send({ valor_vista: '', valor_parcelado: '' });
    expect(res.status).toBe(200);
    expect(res.body.valor_vista).toBeNull();
    expect(res.body.valor_parcelado).toBeNull();
  });

  it('valor numérico em string é gravado normalmente', async () => {
    const res = await request(app)
      .put(`/api/estoque/${produtoId}`)
      .set(authAdmin())
      .send({ valor_vista: '200.00' });
    expect(res.status).toBe(200);
    expect(Number(res.body.valor_vista)).toBe(200);
  });

  it('valor não numérico é rejeitado com 400 (camada Zod)', async () => {
    const res = await request(app)
      .put(`/api/estoque/${produtoId}`)
      .set(authAdmin())
      .send({ valor_vista: 'caro' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('valor_vista');
  });
});
