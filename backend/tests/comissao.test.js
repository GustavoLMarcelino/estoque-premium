import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';
import { periodoDe, periodoAnterior, rotuloPeriodo } from '../src/utils/comissao.js';

let produtoId;

beforeEach(async () => {
  await prisma.comissao_periodo_item.deleteMany();
  await prisma.comissao_periodo.deleteMany();
  await prisma.comissao_config.deleteMany();
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque.deleteMany();
  const marca = await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } });
  produtoId = (
    await prisma.estoque.create({
      data: {
        produto: 'Bateria 60Ah', modelo: 'M60GD', marca_id: marca.id, custo: '200.00', valor_venda: '400.00',
        qtd_minima: 1, qtd_inicial: 200, entradas: 0, saidas: 0,
      },
    })
  ).id;
});

async function saidaBateria(vendedor, quantidade, data = new Date(), garantiaId = null) {
  return prisma.movimentacoes.create({
    data: {
      estoque: { connect: { id: produtoId } },
      tipo: 'SAIDA', quantidade, valor_final: '400.00', vendedor,
      garantia_id: garantiaId, data_movimentacao: data,
    },
  });
}
const meioDe = (p) => new Date((p.inicio.getTime() + p.fim.getTime()) / 2);

/** Pedido de Som COM itens de mão de obra. A apuração soma
 *  pedido_som_item.mao_obra_total × percentual_comissao — o cabeçalho deixou de
 *  ser a fonte, então fixture só de cabeçalho valeria R$ 0.
 *  servicos: [{ valor, pct, tipo? }] — tipo default MAO_OBRA. */
async function pedidoComServicos(servicos, { created_at } = {}) {
  const total = servicos.reduce((a, s) => a + s.valor, 0);
  const comissao = servicos.reduce((a, s) => a + (s.valor * s.pct) / 100, 0);
  return prisma.pedido_som.create({
    data: {
      valor_total: total.toFixed(2),
      valor_mao_obra: total.toFixed(2),
      comissao_joel: comissao.toFixed(2),
      ...(created_at ? { created_at } : {}),
      itens: {
        create: servicos.map((s, i) => ({
          tipo: s.tipo || 'MAO_OBRA',
          descricao: s.descricao || `Servico ${i + 1}`,
          quantidade: 1,
          valor_unit: '0.00',
          valor_total: '0.00',
          mao_obra_unit: s.valor.toFixed(2),
          mao_obra_total: s.valor.toFixed(2),
          percentual_comissao: s.pct == null ? null : s.pct.toFixed(2),
        })),
      },
    },
  });
}

// Datas de entrada em BRT explícito (-03:00) para não depender do fuso do runner.
const rot = (date) => {
  const p = periodoDe(date);
  return rotuloPeriodo(p.inicio, p.fim);
};

describe('periodoDe — quinzenas em horário de Brasília', () => {
  it('1ª quinzena: 01 ao 15', () => {
    expect(rot(new Date('2026-07-09T10:00:00-03:00'))).toBe('01/07 a 15/07');
  });
  it('2ª quinzena de julho (31 dias): 16 ao 31', () => {
    expect(rot(new Date('2026-07-20T10:00:00-03:00'))).toBe('16/07 a 31/07');
  });
  it('fevereiro: termina 28 (não bissexto) e 29 (bissexto)', () => {
    expect(rot(new Date('2026-02-20T12:00:00-03:00'))).toBe('16/02 a 28/02');
    expect(rot(new Date('2024-02-20T12:00:00-03:00'))).toBe('16/02 a 29/02');
  });
  // A borda que mexe com dinheiro: meia-noite BRT do dia 15→16.
  it('23h30 do dia 15 (BRT) ainda é 1ª quinzena; 00h30 do dia 16 já é 2ª', () => {
    expect(rot(new Date('2026-07-15T23:30:00-03:00'))).toBe('01/07 a 15/07');
    expect(rot(new Date('2026-07-16T00:30:00-03:00'))).toBe('16/07 a 31/07');
  });
  it('proximoInicio é o limite exclusivo (00:00 BRT do dia 16 = 03:00 UTC)', () => {
    const p = periodoDe(new Date('2026-07-10T12:00:00-03:00'));
    expect(p.proximoInicio.toISOString()).toBe('2026-07-16T03:00:00.000Z');
    // fim = 1ms antes do próximo início
    expect(p.fim.getTime()).toBe(p.proximoInicio.getTime() - 1);
  });
});

describe('GET /api/comissao/painel — período atual (ao vivo)', () => {
  it('baterias × R$15 por vendedor; Joel 30% da mão de obra; empréstimo não conta', async () => {
    await saidaBateria('Gustavo', 3);
    await saidaBateria('Ismael', 2);
    // saída de empréstimo de garantia (garantia_id setado) NÃO deve contar
    await saidaBateria('Gustavo', 5, new Date(), 999);
    await pedidoComServicos([{ valor: 300, pct: 30 }]);

    const res = await request(app).get('/api/comissao/painel').set(authAdmin());
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.data.vendedores.map((v) => [v.vendedor, v]));
    expect(Number(res.body.data.config.valor_bateria)).toBe(15);
    expect(byName.Gustavo.qtd_baterias).toBe(3); // 5 do empréstimo fora
    expect(Number(byName.Gustavo.valor_comissao)).toBe(45);
    expect(byName.Ismael.qtd_baterias).toBe(2);
    expect(Number(byName.Ismael.valor_comissao)).toBe(30);
    expect(Number(byName.Joel.base_mao_obra)).toBe(300);
    expect(Number(byName.Joel.valor_comissao)).toBe(90);
    expect(res.body.data.periodo.rotulo).toMatch(/^\d\d\/\d\d a \d\d\/\d\d$/);
  });

  it('PUT /config (admin) altera o valor por bateria e reflete no painel', async () => {
    await saidaBateria('Gustavo', 2);
    const put = await request(app).put('/api/comissao/config').set(authAdmin()).send({ valor_bateria: 20 });
    expect(put.status).toBe(200);
    const res = await request(app).get('/api/comissao/painel').set(authAdmin());
    const g = res.body.data.vendedores.find((v) => v.vendedor === 'Gustavo');
    expect(Number(g.valor_comissao)).toBe(40); // 2 × 20
  });

  it('Joel: soma item × a SUA própria %', async () => {
    // mesmo dinheiro de antes (200 a 30% + 380 a 25%), agora vindo da % de cada
    // item em vez de dois baldes globais
    await pedidoComServicos([
      { valor: 200, pct: 30 },
      { valor: 380, pct: 25 },
    ]);
    const res = await request(app).get('/api/comissao/painel').set(authAdmin());
    const joel = res.body.data.vendedores.find((v) => v.vendedor === 'Joel');
    expect(Number(joel.base_mao_obra)).toBe(580); // base é o TOTAL, sem separar
    expect(joel.base_insulfilme).toBeUndefined(); // campo saiu da apuração
    // 200×30% + 380×25% = 60 + 95 = 155
    expect(Number(joel.valor_comissao)).toBe(155);
  });

  it('% livre por item: 40% e 10% no mesmo período', async () => {
    // prova que a % não vem mais de config nenhuma — cada item manda na sua
    await pedidoComServicos([
      { valor: 100, pct: 40 },
      { valor: 200, pct: 10 },
    ]);
    const res = await request(app).get('/api/comissao/painel').set(authAdmin());
    const joel = res.body.data.vendedores.find((v) => v.vendedor === 'Joel');
    expect(Number(joel.base_mao_obra)).toBe(300);
    expect(Number(joel.valor_comissao)).toBe(60); // 40 + 20
  });

  it('item sem percentual_comissao cai no fallback da config (30%)', async () => {
    await pedidoComServicos([{ valor: 100, pct: null }]);
    const res = await request(app).get('/api/comissao/painel').set(authAdmin());
    const joel = res.body.data.vendedores.find((v) => v.vendedor === 'Joel');
    expect(Number(joel.valor_comissao)).toBe(30);
  });

  // REGRESSÃO: item PRODUTO com mão de obra é legado real (produção tinha
  // R$630 assim) e SEMPRE contou na base. Se alguém "simplificar" apurar()
  // acrescentando filtro por tipo='MAO_OBRA', a comissão do passado encolhe
  // em silêncio — este teste é o que pega isso.
  it('item PRODUTO com mao_obra_total conta igual a item MAO_OBRA', async () => {
    await pedidoComServicos([
      { valor: 100, pct: 30, tipo: 'PRODUTO' },
      { valor: 100, pct: 30, tipo: 'MAO_OBRA' },
    ]);
    const res = await request(app).get('/api/comissao/painel').set(authAdmin());
    const joel = res.body.data.vendedores.find((v) => v.vendedor === 'Joel');
    expect(Number(joel.base_mao_obra)).toBe(200); // os DOIS entram
    expect(Number(joel.valor_comissao)).toBe(60);
  });
});

describe('fechamento quinzenal (preguiçoso)', () => {
  it('fecha o período anterior ao acessar o painel e é idempotente', async () => {
    const anterior = periodoAnterior(periodoDe(new Date()).inicio);
    await saidaBateria('Gustavo', 4, meioDe(anterior));

    await request(app).get('/api/comissao/painel').set(authAdmin()).expect(200);
    let periodos = await prisma.comissao_periodo.findMany({ include: { itens: true } });
    expect(periodos).toHaveLength(1);
    const g = periodos[0].itens.find((i) => i.vendedor === 'Gustavo');
    expect(g.qtd_baterias).toBe(4);
    expect(Number(g.valor_comissao)).toBe(60); // 4 × 15
    expect(Number(g.snap_valor_bateria)).toBe(15); // snapshot da config

    // segundo acesso não duplica o fechamento
    await request(app).get('/api/comissao/painel').set(authAdmin()).expect(200);
    periodos = await prisma.comissao_periodo.findMany();
    expect(periodos).toHaveLength(1);

    // o período atual não herda a contagem do período fechado
    const atual = await request(app).get('/api/comissao/painel').set(authAdmin());
    const gAtual = atual.body.data.vendedores.find((v) => v.vendedor === 'Gustavo');
    expect(gAtual.qtd_baterias).toBe(0);
  });

  it('GET /periodos lista fechados e /:id detalha os 3 vendedores', async () => {
    const anterior = periodoAnterior(periodoDe(new Date()).inicio);
    await saidaBateria('Ismael', 1, meioDe(anterior));
    await request(app).get('/api/comissao/painel').set(authAdmin()).expect(200);

    const lista = await request(app).get('/api/comissao/periodos').set(authAdmin());
    expect(lista.status).toBe(200);
    expect(lista.body.data).toHaveLength(1);
    const id = lista.body.data[0].id;

    const det = await request(app).get(`/api/comissao/periodos/${id}`).set(authAdmin());
    expect(det.status).toBe(200);
    expect(det.body.data.itens).toHaveLength(3); // Gustavo, Ismael, Joel
  });

  it('fechamento guarda a % EFETIVA (média ponderada) no snapshot do Joel', async () => {
    const anterior = periodoAnterior(periodoDe(new Date()).inicio);
    // 100 a 40% + 300 a 20% = 40 + 60 = 100 sobre base 400 → efetiva 25%
    await pedidoComServicos(
      [{ valor: 100, pct: 40 }, { valor: 300, pct: 20 }],
      { created_at: meioDe(anterior) },
    );
    await request(app).get('/api/comissao/painel').set(authAdmin()).expect(200);

    const periodos = await prisma.comissao_periodo.findMany({ include: { itens: true } });
    const joel = periodos[0].itens.find((i) => i.vendedor === 'Joel');
    expect(Number(joel.base_mao_obra)).toBe(400);
    expect(Number(joel.valor_comissao)).toBe(100);
    expect(Number(joel.snap_percentual_efetivo)).toBe(25);
  });

  it('linha de bateria fica sem % efetiva (base 0 não tem percentual)', async () => {
    const anterior = periodoAnterior(periodoDe(new Date()).inicio);
    await saidaBateria('Gustavo', 2, meioDe(anterior));
    await request(app).get('/api/comissao/painel').set(authAdmin()).expect(200);

    const periodos = await prisma.comissao_periodo.findMany({ include: { itens: true } });
    const g = periodos[0].itens.find((i) => i.vendedor === 'Gustavo');
    expect(g.snap_percentual_efetivo).toBeNull();
    expect(Number(g.snap_valor_bateria)).toBe(15);
  });
});

/* ─────────── REGRESSÃO: fiado paga comissão igual a venda paga ─────────── */

// DECISÃO TRAVADA, e este teste existe para que ela não seja revertida por
// engano. A comissão de Baterias é R$ fixos POR UNIDADE VENDIDA: ela não olha
// valor, e não olha pagamento. Uma venda fiado é uma venda — o vendedor fez o
// trabalho dele no dia em que ela saiu.
//
// O groupBy de apurar() filtra tipo, garantia_id, vendedor e data. Bastaria
// alguém acrescentar `status_pagamento: 'PAGO'` ali, achando que "corrige" a
// apuração, para o Ismael parar de receber por vendas legítimas — sem erro
// nenhum, só um número menor. É esse acréscimo que estes casos barram.
describe('Comissão de Baterias — fiado conta igual a pago', () => {
  const painel = async () => {
    const { body } = await request(app).get('/api/comissao/painel').set(authAdmin()).expect(200);
    return body.data ?? body;
  };
  const comissaoDe = (dados, nome) =>
    Number((dados.atual?.vendedores ?? dados.vendedores).find((v) => v.vendedor === nome).valor_comissao);

  const fiado = (vendedor, quantidade, data) =>
    prisma.movimentacoes.create({
      data: {
        estoque: { connect: { id: produtoId } },
        tipo: 'SAIDA', quantidade, valor_final: '400.00', vendedor,
        status_pagamento: 'FIADO', forma_pagamento: null, data_movimentacao: data,
      },
    });

  it('venda FIADO gera a MESMA comissão que uma venda paga', async () => {
    const hoje = meioDe(periodoDe(new Date()));

    await saidaBateria('Ismael', 2, hoje);   // paga
    const soPagas = comissaoDe(await painel(), 'Ismael');

    await fiado('Gustavo', 2, hoje);         // fiado, mesma quantidade
    const dados = await painel();

    expect(comissaoDe(dados, 'Gustavo')).toBe(soPagas);
    expect(comissaoDe(dados, 'Gustavo')).toBeGreaterThan(0);
  });

  it('quitar depois NÃO muda a comissão (ela nunca dependeu do pagamento)', async () => {
    const hoje = meioDe(periodoDe(new Date()));
    const mov = await fiado('Ismael', 3, hoje);

    const antes = comissaoDe(await painel(), 'Ismael');

    await request(app).put(`/api/movimentacoes/${mov.id}`).set(authAdmin())
      .send({ status_pagamento: 'PAGO', forma_pagamento: 'pix' });

    expect(comissaoDe(await painel(), 'Ismael')).toBe(antes);
  });

  it('a apuração soma pagas e fiado na mesma conta', async () => {
    const hoje = meioDe(periodoDe(new Date()));
    await saidaBateria('Ismael', 2, hoje);
    await fiado('Ismael', 3, hoje);

    const dados = await painel();
    const item = (dados.atual?.vendedores ?? dados.vendedores).find((v) => v.vendedor === 'Ismael');
    expect(Number(item.qtd_baterias)).toBe(5); // 2 + 3, sem distinção
  });
});
