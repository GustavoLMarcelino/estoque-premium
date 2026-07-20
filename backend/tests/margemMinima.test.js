import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';
import {
  calcularPrecos, precosMinimos, validarMargemMinima, MARGEM_MINIMA_PCT,
} from '../../frontend/src/utils/precos.js';

let marcaId;

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.marca.deleteMany();
  marcaId = (await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } })).id;
});

describe('validarMargemMinima (função pura)', () => {
  it('o mínimo é o líquido pós-taxa fechando em custo + 10%', () => {
    const min = precosMinimos(200);
    // à vista: 223,03 − 1,36% = 220,00 = 200 × 1,10
    expect(min.valor_vista * (1 - 0.0136)).toBeCloseTo(220, 1);
    // parcelado: 252,15 − 12,75% = 220,00
    expect(min.valor_parcelado * (1 - 0.1275)).toBeCloseTo(220, 1);
  });

  it('o preço sugerido com 10% de lucro passa raspando (não reprova a si mesmo)', () => {
    const p = calcularPrecos(200, MARGEM_MINIMA_PCT);
    const r = validarMargemMinima({ custo: 200, valorVista: p.valor_vista, valorParcelado: p.valor_parcelado });
    expect(r.ok).toBe(true);
  });

  it('cada preço é conferido contra a taxa DELE — passar num e falhar no outro reprova', () => {
    const min = precosMinimos(200);
    // vista ok, parcelado abaixo (usa o mínimo do débito no campo do crédito)
    const r = validarMargemMinima({ custo: 200, valorVista: min.valor_vista, valorParcelado: min.valor_vista });
    expect(r.ok).toBe(false);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0].campo).toBe('valor_parcelado');
    expect(r.message).toMatch(/Preço parcelado.*≥ R\$ 252,15/);
  });

  it('os dois abaixo → reporta os dois', () => {
    const r = validarMargemMinima({ custo: 200, valorVista: 100, valorParcelado: 100 });
    expect(r.erros.map((e) => e.campo)).toEqual(['valor_vista', 'valor_parcelado']);
  });

  it('custo <= 0 não é assunto da trava (já barrado antes)', () => {
    expect(validarMargemMinima({ custo: 0, valorVista: 1, valorParcelado: 1 }).ok).toBe(true);
  });
});

// Mesma trava nos dois estoques (helper compartilhado).
const cenarios = [
  { nome: 'baterias', base: '/api/estoque', model: () => prisma.estoque },
  { nome: 'som', base: '/api/estoque-som', model: () => prisma.estoque_som },
];

for (const { nome, base, model } of cenarios) {
  describe(`trava de margem mínima em ${base} [${nome}]`, () => {
    const min = () => precosMinimos(200);
    const bom = () => ({
      produto: 'Bateria 60Ah', modelo: 'BAT-60', marca_id: marcaId,
      custo: 200, valor_venda: min().valor_vista,
      valor_vista: min().valor_vista, valor_parcelado: min().valor_parcelado,
      qtd_minima: 1, qtd_inicial: 5,
    });

    it('POST no mínimo exato → 201', async () => {
      const res = await request(app).post(base).set(authAdmin()).send(bom());
      expect(res.status).toBe(201);
    });

    it('POST com parcelado 1 centavo abaixo → 400 e não grava', async () => {
      const res = await request(app).post(base).set(authAdmin())
        .send({ ...bom(), valor_parcelado: min().valor_parcelado - 0.01 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/parcelado.*≥ R\$ 252,15/);
      expect(await model().count()).toBe(0);
    });

    it('POST com à vista abaixo → 400 (mesmo com parcelado ok)', async () => {
      const res = await request(app).post(base).set(authAdmin())
        .send({ ...bom(), valor_venda: 210, valor_vista: 210 });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/à vista.*≥ R\$ 223,03/);
      expect(await model().count()).toBe(0);
    });

    it('POST sem valor_parcelado usa valor_venda como efetivo → 400 quando esse não cobre a taxa do crédito', async () => {
      const res = await request(app).post(base).set(authAdmin())
        .send({ ...bom(), valor_parcelado: null });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/parcelado/);
    });

    it('PUT baixando só o parcelado → 400 e preço intacto no banco', async () => {
      const criado = (await request(app).post(base).set(authAdmin()).send(bom())).body;
      const res = await request(app).put(`${base}/${criado.id}`).set(authAdmin())
        .send({ valor_parcelado: 230 });
      expect(res.status).toBe(400);
      const depois = await model().findUnique({ where: { id: criado.id } });
      expect(Number(depois.valor_parcelado)).toBeCloseTo(min().valor_parcelado, 2);
    });

    it('PUT subindo o custo COM preço no body → 400: a trava olha o estado final mesclado', async () => {
      const criado = (await request(app).post(base).set(authAdmin()).send(bom())).body;
      const res = await request(app).put(`${base}/${criado.id}`).set(authAdmin())
        .send({ custo: 500, valor_vista: min().valor_vista });
      expect(res.status).toBe(400);
      const depois = await model().findUnique({ where: { id: criado.id } });
      expect(Number(depois.custo)).toBeCloseTo(200, 2); // não gravou
    });

    it('PUT só de custo (Lançamento de Entrada) NÃO dispara a trava — a movimentação já foi gravada', async () => {
      const criado = (await request(app).post(base).set(authAdmin()).send(bom())).body;
      const res = await request(app).put(`${base}/${criado.id}`).set(authAdmin()).send({ custo: 500 });
      expect(res.status).toBe(200);
      const depois = await model().findUnique({ where: { id: criado.id } });
      expect(Number(depois.custo)).toBeCloseTo(500, 2);
    });

    it('PUT que não mexe em preço (só o nome) continua passando', async () => {
      const criado = (await request(app).post(base).set(authAdmin()).send(bom())).body;
      const res = await request(app).put(`${base}/${criado.id}`).set(authAdmin())
        .send({ produto: 'Bateria 60Ah PRO' });
      expect(res.status).toBe(200);
      expect(res.body.produto).toBe('Bateria 60Ah PRO');
    });
  });
}
