import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';
import { diaBRT, inicioDoDiaBRT, fimDoDiaBRT } from '../src/utils/fusoBrasilia.js';

// O resumo de vendas agrupava por dia em UTC; o Registro do Som, em Brasília.
// Uma venda às 22h30 BRT (01h30 UTC do dia seguinte) aparecia em dias
// diferentes nas duas telas. Agora as duas usam o dia de Brasília, e
// from/to de data pura são os limites do dia em Brasília.

let batId;

const vendaBateria = (iso, valor = '300.00') => prisma.movimentacoes.create({
  data: {
    produto_id: batId, tipo: 'SAIDA', quantidade: 1, valor_final: valor,
    forma_pagamento: 'pix', data_movimentacao: new Date(iso),
  },
});
const pedidoSom = (iso, valor = '500.00') => prisma.pedido_som.create({
  data: { valor_total: valor, valor_mao_obra: valor, comissao_joel: '0', forma_pagamento: 'PIX', created_at: new Date(iso) },
});
const resumo = (query = {}) => request(app).get('/api/vendas-resumo').query(query).set(authAdmin());
const serie = (body, linha) => Object.fromEntries(body.data[linha].seriePorDia.map((s) => [s.dia, s.receita]));

beforeEach(async () => {
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.estoque.deleteMany();
  const marca = await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } });
  batId = (await prisma.estoque.create({
    data: {
      produto: 'Bateria', modelo: 'B-1', marca_id: marca.id, custo: '100.00', valor_venda: '300.00',
      qtd_minima: 1, qtd_inicial: 50, entradas: 0, saidas: 0,
    },
  })).id;
});

describe('série por dia — dia de Brasília', () => {
  it('venda às 22h30 BRT (01h30 UTC do dia seguinte) cai no dia local', async () => {
    await vendaBateria('2026-10-21T01:30:00Z'); // 20/10 22:30 BRT
    await pedidoSom('2026-10-21T01:30:00Z');

    const { body } = await resumo();
    expect(serie(body, 'baterias')).toEqual({ '2026-10-20': 300 });
    expect(serie(body, 'som')).toEqual({ '2026-10-20': 500 });
    expect(serie(body, 'total')).toEqual({ '2026-10-20': 800 });
  });

  it('venda às 00h30 BRT (03h30 UTC) cai no dia local, não no anterior', async () => {
    await vendaBateria('2026-10-21T03:30:00Z'); // 21/10 00:30 BRT
    await pedidoSom('2026-10-21T03:30:00Z');

    const { body } = await resumo();
    expect(serie(body, 'total')).toEqual({ '2026-10-21': 800 });
  });

  it('virada do dia: 23h59 BRT e 00h00 BRT ficam em dias vizinhos', async () => {
    await vendaBateria('2026-10-21T02:59:59Z'); // 20/10 23:59:59 BRT
    await vendaBateria('2026-10-21T03:00:00Z'); // 21/10 00:00:00 BRT

    const { body } = await resumo();
    expect(serie(body, 'baterias')).toEqual({ '2026-10-20': 300, '2026-10-21': 300 });
  });
});

describe('from/to de data pura — limites em Brasília', () => {
  it('from=to=dia inclui 00:00 BRT e 23:59:59.999 BRT e exclui os vizinhos', async () => {
    await vendaBateria('2026-10-20T02:59:59.999Z'); // 19/10 23:59:59.999 BRT → fora
    await vendaBateria('2026-10-20T03:00:00.000Z'); // 20/10 00:00 BRT → dentro
    await vendaBateria('2026-10-21T02:59:59.999Z'); // 20/10 23:59:59.999 BRT → dentro
    await vendaBateria('2026-10-21T03:00:00.000Z'); // 21/10 00:00 BRT → fora

    const { body } = await resumo({ from: '2026-10-20', to: '2026-10-20' });
    expect(body.data.baterias.qtdVendas).toBe(2);
    expect(body.data.baterias.vendasBrutas).toBe(600);
  });

  it('venda das 22h30 BRT entra em to=dia (em UTC já seria o dia seguinte)', async () => {
    await vendaBateria('2026-10-21T01:30:00Z'); // 20/10 22:30 BRT

    expect((await resumo({ from: '2026-10-20', to: '2026-10-20' })).body.data.baterias.qtdVendas).toBe(1);
    expect((await resumo({ from: '2026-10-21', to: '2026-10-21' })).body.data.baterias.qtdVendas).toBe(0);
  });

  it('ISO completo continua sendo o instante exato (card semanal da Home)', async () => {
    await vendaBateria('2026-10-21T01:30:00Z');
    const { body } = await resumo({ from: '2026-10-21T01:00:00.000Z', to: '2026-10-21T02:00:00.000Z' });
    expect(body.data.baterias.qtdVendas).toBe(1);
  });
});

describe('concordância com o Registro do Som', () => {
  it('mesmo dia, mesmo total e mesma contagem de pedidos', async () => {
    await pedidoSom('2026-10-21T01:30:00Z', '200.00'); // 20/10 22:30 BRT
    await pedidoSom('2026-10-20T15:00:00Z', '300.00'); // 20/10 12:00 BRT
    await pedidoSom('2026-10-21T03:30:00Z', '900.00'); // 21/10 00:30 BRT (outro dia)

    const dash = (await resumo({ from: '2026-10-20', to: '2026-10-20' })).body.data.som;
    const reg = (await request(app).get('/api/som/registro?de=2026-10-20&ate=2026-10-20').set(authAdmin())).body;

    expect(reg.resumoPeriodo.pedidos).toBe(2);
    expect(reg.resumoPeriodo.total).toBe(500);
    expect(dash.vendasBrutas).toBe(reg.resumoPeriodo.total);
    expect(dash.qtdPedidos).toBe(reg.resumoPeriodo.pedidos);
    expect(serie({ data: { som: dash } }, 'som')).toEqual({ '2026-10-20': 500 });
  });
});

describe('fusoBrasilia', () => {
  it('diaBRT, inicioDoDiaBRT e fimDoDiaBRT são coerentes', () => {
    expect(diaBRT(new Date('2026-10-21T02:59:59Z'))).toBe('2026-10-20');
    expect(inicioDoDiaBRT('2026-10-20').toISOString()).toBe('2026-10-20T03:00:00.000Z');
    expect(fimDoDiaBRT('2026-10-20').toISOString()).toBe('2026-10-21T02:59:59.999Z');
  });
});
