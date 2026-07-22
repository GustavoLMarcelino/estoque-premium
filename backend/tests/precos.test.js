import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { calcularPrecos, precoTabelaSom, usaPrecoParcelado, lucroLiquidoEstoque, TAXA_DEBITO, TAXA_PARCELADO } from '../../frontend/src/utils/precos.js';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

describe('calcularPrecos (função pura — multiplicador 1/(1−taxa): débito 1,36% / 10x 12,75%)', () => {
  it('multiplicadores usam 1/(1−taxa), não (1+taxa)', () => {
    // Débito 1,36% → 1/(1−0,0136) ≈ 1,0138; 10x 12,75% → 1/(1−0,1275) ≈ 1,1461.
    expect(TAXA_DEBITO).toBeCloseTo(1.0138, 4);
    expect(TAXA_PARCELADO).toBeCloseTo(1.1461, 4);
    // Fecha o líquido: preço × (1−taxa) volta à base (o que (1+taxa) NÃO faz).
    expect(1000 * TAXA_DEBITO * (1 - 0.0136)).toBeCloseTo(1000, 6);
    expect(1000 * TAXA_PARCELADO * (1 - 0.1275)).toBeCloseTo(1000, 6);
  });

  it('calcula à vista e parcelado a partir de custo + % lucro', () => {
    // custo 200, lucro 100% → base 400
    const r = calcularPrecos(200, 100);
    expect(r.valor_vista).toBeCloseTo(400 * TAXA_DEBITO, 2);
    expect(r.valor_parcelado).toBeCloseTo(400 * TAXA_PARCELADO, 2);
  });

  it('lucro 0 aplica só a taxa sobre o custo', () => {
    const r = calcularPrecos(1000, 0);
    expect(r.valor_vista).toBe(+(1000 * TAXA_DEBITO).toFixed(2));
    expect(r.valor_parcelado).toBe(+(1000 * TAXA_PARCELADO).toFixed(2));
  });

  it('custo 0 zera os dois preços', () => {
    expect(calcularPrecos(0, 50)).toEqual({ valor_vista: 0, valor_parcelado: 0 });
  });

  it("custo/lucro vazios ou não numéricos são tratados como 0 (comportamento atual)", () => {
    expect(calcularPrecos('', '')).toEqual({ valor_vista: 0, valor_parcelado: 0 });
    expect(calcularPrecos('abc', 10)).toEqual({ valor_vista: 0, valor_parcelado: 0 });
    const soCusto = calcularPrecos(100, 'abc'); // lucro inválido → 0
    expect(soCusto.valor_vista).toBe(+(100 * TAXA_DEBITO).toFixed(2));
  });

  it('arredonda para 2 casas decimais', () => {
    const r = calcularPrecos(33.33, 7.77);
    expect(r.valor_vista).toBe(+r.valor_vista.toFixed(2));
    expect(r.valor_parcelado).toBe(+r.valor_parcelado.toFixed(2));
  });
});

describe('lucroLiquidoEstoque (lucro líquido pós-taxa, pior caso à vista/parcelado)', () => {
  it('caso normal: preços gerados com a MESMA margem convergem para o lucro real', () => {
    // custo 100 + 30% → à vista e parcelado embutem cada taxa; o líquido de
    // ambos volta para 30 (o inverso exato de calcularPrecos).
    const custo = 100;
    const { valor_vista, valor_parcelado } = calcularPrecos(custo, 30);
    const r = lucroLiquidoEstoque({ custo, valorVista: valor_vista, valorParcelado: valor_parcelado });
    expect(r.lucroVista).toBeCloseTo(30, 1);
    expect(r.lucroParcelado).toBeCloseTo(30, 1);
    expect(r.lucro).toBeCloseTo(30, 1);
    expect(r.percent).toBeCloseTo(30, 1);
  });

  it('custo 0: percent 0 (sem divisão por zero), lucro em R$ segue calculável', () => {
    const r = lucroLiquidoEstoque({ custo: 0, valorVista: 100, valorParcelado: 100 });
    expect(r.percent).toBe(0);
    expect(Number.isNaN(r.percent)).toBe(false);
    expect(r.lucro).toBeCloseTo(100 / TAXA_PARCELADO, 2); // pior caso = parcelado
  });

  it('custo null: tratado como 0 → percent 0', () => {
    const r = lucroLiquidoEstoque({ custo: null, valorVista: 100, valorParcelado: null });
    expect(r.percent).toBe(0);
    expect(r.lucro).toBeCloseTo(100 / TAXA_DEBITO, 2);
  });

  it('parcelado ausente: cai só no à vista (NÃO retorna −custo)', () => {
    const r = lucroLiquidoEstoque({ custo: 100, valorVista: 200, valorParcelado: null });
    expect(r.lucroParcelado).toBeNull();
    expect(r.lucro).toBeCloseTo(200 / TAXA_DEBITO - 100, 2);
    expect(r.lucro).toBeGreaterThan(0); // não virou −100
  });

  it('parcelado 0 é ignorado (mesma regra do ausente)', () => {
    const r = lucroLiquidoEstoque({ custo: 100, valorVista: 200, valorParcelado: 0 });
    expect(r.lucroParcelado).toBeNull();
    expect(r.lucro).toBeCloseTo(200 / TAXA_DEBITO - 100, 2);
  });

  it('lucro negativo: preço abaixo do custo mantém sinal negativo', () => {
    const r = lucroLiquidoEstoque({ custo: 100, valorVista: 50, valorParcelado: 50 });
    expect(r.lucro).toBeLessThan(0);
    expect(r.percent).toBeLessThan(0);
  });

  it('pior caso pode cair no À VISTA quando ele é menor que o parcelado', () => {
    // à vista mal precificado (pouca margem) vs parcelado gordo → min = à vista
    const r = lucroLiquidoEstoque({ custo: 100, valorVista: 105, valorParcelado: 200 });
    expect(r.lucroVista).toBeLessThan(r.lucroParcelado);
    expect(r.lucro).toBe(r.lucroVista);
  });

  it('nenhum preço válido: lucro null, percent 0', () => {
    const r = lucroLiquidoEstoque({ custo: 100, valorVista: null, valorParcelado: null });
    expect(r.lucro).toBeNull();
    expect(r.percent).toBe(0);
  });
});

describe('usaPrecoParcelado (regra única de base de preço por forma de pagamento)', () => {
  it('crédito (qualquer grafia/parcela) usa o preço PARCELADO', () => {
    expect(usaPrecoParcelado('credito')).toBe(true);          // Venda Simples
    expect(usaPrecoParcelado('Crédito')).toBe(true);
    expect(usaPrecoParcelado('Crédito parcelado')).toBe(true); // Pedido Som
    expect(usaPrecoParcelado('Crédito à vista')).toBe(true);   // à vista TAMBÉM é parcelado
  });

  it('dinheiro, débito e pix usam o preço À VISTA', () => {
    expect(usaPrecoParcelado('dinheiro')).toBe(false);
    expect(usaPrecoParcelado('debito')).toBe(false);
    expect(usaPrecoParcelado('Débito')).toBe(false);
    expect(usaPrecoParcelado('pix')).toBe(false);
    expect(usaPrecoParcelado('PIX')).toBe(false);
  });

  it('vazio/desconhecido cai no à vista (default seguro)', () => {
    expect(usaPrecoParcelado('')).toBe(false);
    expect(usaPrecoParcelado(null)).toBe(false);
    expect(usaPrecoParcelado(undefined)).toBe(false);
  });
});

describe('precoTabelaSom (aba SOM — soma mão de obra da classe, cheia)', () => {
  it('produto COM classe: soma valor_mao_obra no parcelado e no à vista', () => {
    // Exemplo do desenho: Rádio peça 140 (parcelado) + classe 50 = 190
    const row = { valor_parcelado: 140, valor_vista: 120, classe: { valor_mao_obra: 50 } };
    expect(precoTabelaSom(row)).toEqual({ valorParcelado: 190, valorVista: 170 });
  });

  it('mão de obra é CHEIA nos dois (nunca desconta no à vista)', () => {
    const row = { valor_parcelado: 200, valor_vista: 180, classe: { valor_mao_obra: 60 } };
    const r = precoTabelaSom(row);
    expect(r.valorParcelado - 200).toBe(60);
    expect(r.valorVista - 180).toBe(60); // mesma mão de obra cheia
  });

  it('produto SEM classe: só o preço da peça (igual hoje)', () => {
    const row = { valor_parcelado: 140, valor_vista: 120 };
    expect(precoTabelaSom(row)).toEqual({ valorParcelado: 140, valorVista: 120 });
  });

  it('fallback: valor_venda espelha os dois quando faltam', () => {
    const row = { valor_venda: 100, classe: { valor_mao_obra: 50 } };
    expect(precoTabelaSom(row)).toEqual({ valorParcelado: 150, valorVista: 150 });
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
