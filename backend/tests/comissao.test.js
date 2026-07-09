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
    await prisma.pedido_som.create({ data: { valor_total: '300.00', valor_mao_obra: '300.00', comissao_joel: '90.00' } });

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
});
