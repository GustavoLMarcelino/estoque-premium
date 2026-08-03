import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';
import { precosMinimos } from '../../frontend/src/utils/precos.js';

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

// Reposição de custo/preços NA ENTRADA de Som — espelha o que o Lançamento de
// Baterias já faz (tests/entradaMargem.test.js). Motivo: até aqui o custo de Som
// só mudava pelo Cadastro, então uma reposição mais cara deixava o custo velho
// no produto — e qualquer apuração de lucro de Som nasceria otimista.
describe('POST /api/movimentacoes-som — entrada que repõe custo/preços', () => {
  const CUSTO_INICIAL = 200;
  let comPrecosId;

  beforeEach(async () => {
    const marca = await prisma.marca.upsert({ where: { nome: 'JBL' }, update: {}, create: { nome: 'JBL' } });
    const min = precosMinimos(CUSTO_INICIAL);
    comPrecosId = (
      await prisma.estoque_som.create({
        data: {
          produto: 'Central Multimídia', modelo: 'MM-1', marca_id: marca.id,
          custo: String(CUSTO_INICIAL), valor_venda: String(min.valor_vista),
          valor_vista: String(min.valor_vista), valor_parcelado: String(min.valor_parcelado),
          qtd_minima: 1, qtd_inicial: 5, entradas: 0, saidas: 0,
        },
      })
    ).id;
  });

  const entrada = (extra = {}) => ({ produto_id: comPrecosId, tipo: 'entrada', quantidade: 3, ...extra });
  const produto = () => prisma.estoque_som.findUnique({ where: { id: comPrecosId } });

  it('entrada SÓ com quantidade: custo e preços intactos (comportamento de antes)', async () => {
    const antes = await produto();
    const res = await criarMov(entrada());
    expect(res.status).toBe(201);
    const p = await produto();
    expect(p.entradas).toBe(3);
    expect(Number(p.custo)).toBeCloseTo(CUSTO_INICIAL, 2);
    expect(Number(p.valor_vista)).toBeCloseTo(Number(antes.valor_vista), 2);
    expect(Number(p.valor_parcelado)).toBeCloseTo(Number(antes.valor_parcelado), 2);
  });

  it('custo novo que MANTÉM a margem: custo e entradas gravados no mesmo request', async () => {
    const res = await criarMov(entrada({ custo: 150 }));
    expect(res.status).toBe(201);
    const p = await produto();
    expect(Number(p.custo)).toBeCloseTo(150, 2);
    expect(p.entradas).toBe(3); // mesma transação
    expect(await prisma.movimentacoes_som.count()).toBe(1);
  });

  it('preços novos: valor_vista, valor_parcelado e o espelho valor_venda', async () => {
    const novos = precosMinimos(400);
    const res = await criarMov(entrada({
      custo: 400, valor_vista: novos.valor_vista, valor_parcelado: novos.valor_parcelado,
    }));
    expect(res.status).toBe(201);
    const p = await produto();
    expect(Number(p.custo)).toBeCloseTo(400, 2);
    expect(Number(p.valor_vista)).toBeCloseTo(novos.valor_vista, 2);
    expect(Number(p.valor_parcelado)).toBeCloseTo(novos.valor_parcelado, 2);
    expect(Number(p.valor_venda)).toBeCloseTo(novos.valor_vista, 2); // espelho mantido
    expect(p.entradas).toBe(3);
  });

  it('custo que DERRUBA a margem: 400 e NADA gravado (rollback da transação)', async () => {
    const res = await criarMov(entrada({ custo: 400 }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/abaixo do mínimo/i);
    const p = await produto();
    expect(Number(p.custo)).toBeCloseTo(CUSTO_INICIAL, 2); // custo intacto
    expect(p.entradas).toBe(0);                            // agregado intacto
    expect(await prisma.movimentacoes_som.count()).toBe(0);
  });

  it('corrigir só UM dos dois preços não basta — o outro segue abaixo', async () => {
    const novos = precosMinimos(400);
    const res = await criarMov(entrada({ custo: 400, valor_vista: novos.valor_vista }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/parcelado/i);
    expect(await prisma.movimentacoes_som.count()).toBe(0);
  });

  // custo 0 zerava o custo do produto e envenenava a apuração de lucro: o zod
  // era nonnegative() e a trava de margem só age com custo > 0, então passava
  // pelos dois. Agora o schema COMPARTILHADO exige > 0 quando o campo vem.
  it.each([0, -1])('custo %s → 400 "maior que zero", custo intacto e rollback', async (v) => {
    const res = await criarMov(entrada({ custo: v }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/maior que zero/i);
    const p = await produto();
    expect(Number(p.custo)).toBeCloseTo(CUSTO_INICIAL, 2); // custo intacto
    expect(p.entradas).toBe(0);                            // agregado intacto
    expect(await prisma.movimentacoes_som.count()).toBe(0);
  });

  it('omitir custo segue válido: entrada só com quantidade não é barrada', async () => {
    const res = await criarMov(entrada());
    expect(res.status).toBe(201);
    expect((await produto()).entradas).toBe(3);
  });

  it('SAÍDA não pode mexer em custo/preço', async () => {
    const res = await criarMov({ produto_id: comPrecosId, tipo: 'saida', quantidade: 1, custo: 10 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/entrada/i);
    expect(Number((await produto()).custo)).toBeCloseTo(CUSTO_INICIAL, 2);
  });

  it('não-admin não altera custo pela entrada (403), mesmo podendo dar entrada', async () => {
    const res = await criarMov(entrada({ custo: 150 }), authUser());
    expect(res.status).toBe(403);
    expect(await prisma.movimentacoes_som.count()).toBe(0);
    expect(Number((await produto()).custo)).toBeCloseTo(CUSTO_INICIAL, 2);
  });
});

// Espelho do mesmo contrato na linha Som (ver movimentacoes.test.js): o campo
// de valor saiu das telas de ENTRADA; na SAÍDA continua sendo a receita.
describe('valor_final em Som: ausente na entrada, preservado na saída', () => {
  it('ENTRADA sem valor_final → 201 e grava o default 0.00', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 4 });
    expect(res.status).toBe(201);
    const mov = await prisma.movimentacoes_som.findFirst({ orderBy: { id: 'desc' } });
    expect(mov.tipo).toBe('ENTRADA');
    expect(Number(mov.valor_final)).toBe(0);
    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.entradas).toBe(4);
  });

  it('SAÍDA com valor_final → receita gravada intacta (NÃO regrediu)', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'saida', quantidade: 2, valor_final: '150.00' });
    expect(res.status).toBe(201);
    const mov = await prisma.movimentacoes_som.findFirst({ orderBy: { id: 'desc' } });
    expect(mov.tipo).toBe('SAIDA');
    expect(Number(mov.valor_final)).toBe(150);
  });
});
