import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';
import { precosMinimos, margemLiquidaPct } from '../../frontend/src/utils/precos.js';

// Entrada que repõe o custo: custo e preços vão no MESMO POST /movimentacoes,
// gravados na transação da movimentação. Reprovou a margem → nada é gravado.

let marcaId;
let produtoId;

const CUSTO_INICIAL = 200;
const min200 = () => precosMinimos(CUSTO_INICIAL);

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.marca.deleteMany();
  marcaId = (await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } })).id;

  const res = await request(app).post('/api/estoque').set(authAdmin()).send({
    produto: 'Bateria 60Ah', modelo: 'BAT-60', marca_id: marcaId,
    custo: CUSTO_INICIAL,
    valor_venda: min200().valor_vista,
    valor_vista: min200().valor_vista,
    valor_parcelado: min200().valor_parcelado,
    qtd_minima: 1, qtd_inicial: 5,
  });
  expect(res.status).toBe(201);
  produtoId = res.body.id;
});

const entrada = (extra = {}) => ({ produto_id: produtoId, tipo: 'entrada', quantidade: 3, ...extra });
const produto = () => prisma.estoque.findUnique({ where: { id: produtoId } });

describe('margemLiquidaPct (função pura)', () => {
  it('no preço mínimo a margem dá exatamente 10% nos dois', () => {
    const m = margemLiquidaPct({
      custo: 200, valorVista: min200().valor_vista, valorParcelado: min200().valor_parcelado,
    });
    expect(m.vista).toBeCloseTo(10, 1);
    expect(m.parcelado).toBeCloseTo(10, 1);
  });

  it('dobrar o custo derruba as duas margens para baixo de 10%', () => {
    const m = margemLiquidaPct({
      custo: 400, valorVista: min200().valor_vista, valorParcelado: min200().valor_parcelado,
    });
    expect(m.vista).toBeLessThan(10);
    expect(m.parcelado).toBeLessThan(10);
  });

  it('sem custo não calcula', () => {
    expect(margemLiquidaPct({ custo: 0, valorVista: 100, valorParcelado: 100 }).vista).toBeNull();
  });
});

describe('POST /api/movimentacoes — entrada com custo novo', () => {
  it('entrada SEM custo: grava normal e não mexe em preço (comportamento de antes)', async () => {
    const res = await request(app).post('/api/movimentacoes').set(authAdmin()).send(entrada());
    expect(res.status).toBe(201);
    const p = await produto();
    expect(p.entradas).toBe(3);
    expect(Number(p.custo)).toBeCloseTo(CUSTO_INICIAL, 2);
  });

  it('custo novo que MANTÉM a margem: grava movimentação e custo no mesmo request', async () => {
    const res = await request(app).post('/api/movimentacoes').set(authAdmin())
      .send(entrada({ custo: 150 }));
    expect(res.status).toBe(201);
    const p = await produto();
    expect(p.entradas).toBe(3);
    expect(Number(p.custo)).toBeCloseTo(150, 2);
  });

  it('custo novo que DERRUBA a margem: 400 e NADA gravado (nem mov, nem custo, nem entradas)', async () => {
    const res = await request(app).post('/api/movimentacoes').set(authAdmin())
      .send(entrada({ custo: 400 }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/abaixo do mínimo/i);

    const p = await produto();
    expect(Number(p.custo)).toBeCloseTo(CUSTO_INICIAL, 2); // custo intacto
    expect(p.entradas).toBe(0);                            // agregado intacto
    expect(await prisma.movimentacoes.count()).toBe(0);    // rollback da transação
  });

  it('custo alto + preços corrigidos JUNTO: passa e grava tudo atômico', async () => {
    const novos = precosMinimos(400);
    const res = await request(app).post('/api/movimentacoes').set(authAdmin())
      .send(entrada({ custo: 400, valor_vista: novos.valor_vista, valor_parcelado: novos.valor_parcelado }));
    expect(res.status).toBe(201);

    const p = await produto();
    expect(Number(p.custo)).toBeCloseTo(400, 2);
    expect(Number(p.valor_vista)).toBeCloseTo(novos.valor_vista, 2);
    expect(Number(p.valor_parcelado)).toBeCloseTo(novos.valor_parcelado, 2);
    expect(Number(p.valor_venda)).toBeCloseTo(novos.valor_vista, 2); // espelho mantido
    expect(p.entradas).toBe(3);
  });

  it('corrigir só UM dos dois preços não basta — o outro segue abaixo', async () => {
    const novos = precosMinimos(400);
    const res = await request(app).post('/api/movimentacoes').set(authAdmin())
      .send(entrada({ custo: 400, valor_vista: novos.valor_vista }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/parcelado/i);
    expect(await prisma.movimentacoes.count()).toBe(0);
  });

  it('preço 1 centavo abaixo do mínimo ainda reprova', async () => {
    const novos = precosMinimos(400);
    const res = await request(app).post('/api/movimentacoes').set(authAdmin())
      .send(entrada({
        custo: 400,
        valor_vista: novos.valor_vista,
        valor_parcelado: novos.valor_parcelado - 0.01,
      }));
    expect(res.status).toBe(400);
  });

  it('SAÍDA não pode mexer em custo/preço', async () => {
    const res = await request(app).post('/api/movimentacoes').set(authAdmin())
      .send({ produto_id: produtoId, tipo: 'saida', quantidade: 1, custo: 10 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/entrada/i);
  });

  it('não-admin não altera custo pela entrada (403), mesmo com permissão de entrada/saída', async () => {
    const res = await request(app).post('/api/movimentacoes').set(authUser())
      .send(entrada({ custo: 150 }));
    expect(res.status).toBe(403);
    expect(await prisma.movimentacoes.count()).toBe(0);
  });
});
