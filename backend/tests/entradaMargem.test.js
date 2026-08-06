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
  await prisma.venda_auditoria.deleteMany();
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

  // Regressão: custo 0 passava (zod nonnegative + trava de margem inerte com
  // custo 0) e ZERAVA o custo do produto. Guard no schema compartilhado com
  // /movimentacoes-som — uma correção, as duas linhas.
  it.each([0, -1])('custo %s → 400 "maior que zero", custo intacto e rollback', async (v) => {
    const res = await request(app).post('/api/movimentacoes').set(authAdmin())
      .send(entrada({ custo: v }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/maior que zero/i);
    const p = await produto();
    expect(Number(p.custo)).toBeCloseTo(CUSTO_INICIAL, 2); // custo intacto
    expect(p.entradas).toBe(0);                            // agregado intacto
    expect(await prisma.movimentacoes.count()).toBe(0);
  });

  it('omitir custo segue válido: entrada só com quantidade não é barrada', async () => {
    const res = await request(app).post('/api/movimentacoes').set(authAdmin()).send(entrada());
    expect(res.status).toBe(201);
    expect((await produto()).entradas).toBe(3);
  });

  it('não-admin não altera custo pela entrada (403), mesmo com permissão de entrada/saída', async () => {
    const res = await request(app).post('/api/movimentacoes').set(authUser())
      .send(entrada({ custo: 150 }));
    expect(res.status).toBe(403);
    expect(await prisma.movimentacoes.count()).toBe(0);
  });
});

/* ───────────── diário do custo anterior (venda_auditoria / CRIACAO) ───────────── */

// O custo do produto é sobrescrita absoluta e RETROATIVA: o dashboard calcula o
// lucro de toda venda passada com o custo de agora. Sem este registro, ninguém
// consegue dizer depois qual era o custo antes do lançamento — nem se ele mudou.
// Excluir a entrada também não devolve o custo, então o log é a única memória.

/** Única linha do diário, com o snapshot já desserializado. */
async function unicoLog() {
  const linhas = await prisma.venda_auditoria.findMany();
  expect(linhas).toHaveLength(1);
  return { ...linhas[0], snapshot: JSON.parse(linhas[0].conteudo_anterior) };
}

describe('POST /api/movimentacoes — entrada que mexe em custo vira linha no diário', () => {
  it('grava CRIACAO com o custo/preços de ANTES e o que foi aplicado', async () => {
    const res = await request(app).post('/api/movimentacoes').set(authAdmin())
      .send(entrada({ custo: 150 }));
    expect(res.status).toBe(201);

    const a = await unicoLog();
    expect(a.linha).toBe('baterias');
    expect(a.entidade).toBe('movimentacoes');
    expect(a.entidade_id).toBe(res.body.id);
    expect(a.acao).toBe('CRIACAO');
    expect(a.feito_por).toBe('admin@teste.local');
    expect(a.user_id).toBe(1);

    // ANTERIOR: o estado que o produto tinha, não o que passou a ter.
    const p = a.snapshot.produto;
    expect(p.id).toBe(produtoId);
    expect(p.produto).toBe('Bateria 60Ah');
    expect(p.modelo).toBe('BAT-60');
    expect(Number(p.custo)).toBeCloseTo(CUSTO_INICIAL, 2);
    expect(Number(p.valor_vista)).toBeCloseTo(min200().valor_vista, 2);
    expect(Number(p.valor_parcelado)).toBeCloseTo(min200().valor_parcelado, 2);
    expect(Number(p.valor_venda)).toBeCloseTo(min200().valor_vista, 2);

    // ...e o produto de verdade JÁ está com o custo novo: o snapshot é o de antes.
    expect(Number((await produto()).custo)).toBeCloseTo(150, 2);
    expect(Number(a.snapshot.aplicado.custo)).toBeCloseTo(150, 2);
  });

  it('`aplicado` distingue custo alterado de custo reposto igual', async () => {
    await request(app).post('/api/movimentacoes').set(authAdmin())
      .send(entrada({ custo: CUSTO_INICIAL }));

    const a = await unicoLog();
    // Sem o `aplicado`, este caso seria indistinguível de uma alteração real:
    // a linha existe, e o "antes" sozinho não diz que nada mudou.
    expect(Number(a.snapshot.produto.custo)).toBeCloseTo(CUSTO_INICIAL, 2);
    expect(Number(a.snapshot.aplicado.custo)).toBeCloseTo(CUSTO_INICIAL, 2);
  });

  it('entrada SEM custo não gera linha nenhuma', async () => {
    const res = await request(app).post('/api/movimentacoes').set(authAdmin()).send(entrada());
    expect(res.status).toBe(201);
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });

  it('SAÍDA não gera linha (comportamento intocado)', async () => {
    const res = await request(app).post('/api/movimentacoes').set(authAdmin())
      .send({ produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 300 });
    expect(res.status).toBe(201);
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });

  it('só valor_vista, sem custo: também é mexer em preço, também registra', async () => {
    const novo = min200().valor_vista + 50;
    const res = await request(app).post('/api/movimentacoes').set(authAdmin())
      .send(entrada({ valor_vista: novo }));
    expect(res.status).toBe(201);

    const a = await unicoLog();
    expect(Number(a.snapshot.produto.valor_vista)).toBeCloseTo(min200().valor_vista, 2);
    expect(Number(a.snapshot.aplicado.valor_vista)).toBeCloseTo(novo, 2);
  });

  it('margem reprovada: 400 e o log some junto no rollback', async () => {
    const res = await request(app).post('/api/movimentacoes').set(authAdmin())
      .send(entrada({ custo: 400 }));
    expect(res.status).toBe(400);

    // Registrar um lançamento que não aconteceu seria pior que não registrar.
    expect(await prisma.venda_auditoria.count()).toBe(0);
    expect(await prisma.movimentacoes.count()).toBe(0);
    expect(Number((await produto()).custo)).toBeCloseTo(CUSTO_INICIAL, 2);
  });

  it('não-admin barrado no 403 não deixa log', async () => {
    await request(app).post('/api/movimentacoes').set(authUser()).send(entrada({ custo: 150 }));
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });

  it('duas entradas encadeiam: a 2ª registra o custo que a 1ª deixou', async () => {
    await request(app).post('/api/movimentacoes').set(authAdmin()).send(entrada({ custo: 150 }));
    await request(app).post('/api/movimentacoes').set(authAdmin()).send(entrada({ custo: 120 }));

    const linhas = await prisma.venda_auditoria.findMany({ orderBy: { id: 'asc' } });
    expect(linhas).toHaveLength(2);
    const anterior = (l) => Number(JSON.parse(l.conteudo_anterior).produto.custo);
    expect(anterior(linhas[0])).toBeCloseTo(CUSTO_INICIAL, 2); // 200 → 150
    expect(anterior(linhas[1])).toBeCloseTo(150, 2);           // 150 → 120
    expect(Number((await produto()).custo)).toBeCloseTo(120, 2);
  });

  it('excluir a entrada depois NÃO devolve o custo — e o log continua lá', async () => {
    const mov = (await request(app).post('/api/movimentacoes').set(authAdmin())
      .send(entrada({ custo: 150 }))).body;

    const del = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(204);

    // É exatamente o que o aviso da tela de exclusão passou a dizer.
    expect(Number((await produto()).custo)).toBeCloseTo(150, 2);
    expect((await produto()).entradas).toBe(0); // quantidade, essa sim, volta

    const acoes = (await prisma.venda_auditoria.findMany({ orderBy: { id: 'asc' } })).map((l) => l.acao);
    expect(acoes).toEqual(['CRIACAO', 'EXCLUSAO']);
  });
});
