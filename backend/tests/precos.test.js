import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { calcularPrecos, TAXA_DEBITO, TAXA_PARCELADO } from '../../frontend/src/utils/precos.js';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

describe('calcularPrecos (função pura — taxas 1,09% débito / 11,19% parcelado)', () => {
  it('calcula à vista e parcelado a partir de custo + % lucro', () => {
    // custo 200, lucro 100% → base 400
    const r = calcularPrecos(200, 100);
    expect(r.valor_vista).toBeCloseTo(400 * TAXA_DEBITO, 2); // 404.36
    expect(r.valor_parcelado).toBeCloseTo(400 * TAXA_PARCELADO, 2); // 444.76
  });

  it('lucro 0 aplica só a taxa sobre o custo', () => {
    const r = calcularPrecos(1000, 0);
    expect(r.valor_vista).toBe(1010.9);
    expect(r.valor_parcelado).toBe(1111.9);
  });

  it('custo 0 zera os dois preços', () => {
    expect(calcularPrecos(0, 50)).toEqual({ valor_vista: 0, valor_parcelado: 0 });
  });

  it("custo/lucro vazios ou não numéricos são tratados como 0 (comportamento atual)", () => {
    expect(calcularPrecos('', '')).toEqual({ valor_vista: 0, valor_parcelado: 0 });
    expect(calcularPrecos('abc', 10)).toEqual({ valor_vista: 0, valor_parcelado: 0 });
    const soCusto = calcularPrecos(100, 'abc'); // lucro inválido → 0
    expect(soCusto.valor_vista).toBe(101.09);
  });

  it('arredonda para 2 casas decimais', () => {
    const r = calcularPrecos(33.33, 7.77);
    expect(r.valor_vista).toBe(+r.valor_vista.toFixed(2));
    expect(r.valor_parcelado).toBe(+r.valor_parcelado.toFixed(2));
  });
});

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
