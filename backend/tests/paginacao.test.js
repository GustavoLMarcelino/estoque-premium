import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';
import { paginacao, envelope } from '../src/utils/paginacao.js';

// Clamp de paginação — o envelope passa a CONTAR quando cortou.
//
// O clamp sempre existiu; o que não existia era sinal. Quem pedia 500 recebia
// 100 sem erro, sem aviso e sem campo, e foi assim que três cards da Home
// passaram meses somando sobre listas truncadas. pageSizeSolicitado devolve o
// valor bruto da query: `pageSizeSolicitado > pageSize` é o corte.

describe('helper paginacao()', () => {
  it('clampa no teto e preserva o que foi pedido', () => {
    const p = paginacao({ pageSize: '500' }, { padrao: 10, teto: 100 });
    expect(p.pageSize).toBe(100);
    expect(p.pageSizeSolicitado).toBe(500);
  });

  it('abaixo do teto: solicitado == pageSize', () => {
    const p = paginacao({ pageSize: '30' }, { padrao: 10, teto: 100 });
    expect(p.pageSize).toBe(30);
    expect(p.pageSizeSolicitado).toBe(30);
  });

  it('sem pageSize cai no padrão da rota, e o solicitado é esse padrão', () => {
    const p = paginacao({}, { padrao: 20, teto: 100 });
    expect(p.pageSize).toBe(20);
    expect(p.pageSizeSolicitado).toBe(20);
  });

  it('lixo e zero caem no padrão, como sempre caíram', () => {
    expect(paginacao({ pageSize: 'abc' }, { padrao: 10, teto: 100 }).pageSize).toBe(10);
    expect(paginacao({ pageSize: '0' }, { padrao: 10, teto: 100 }).pageSize).toBe(10);
  });

  it('negativo vira 1 (nunca take negativo no Prisma)', () => {
    const p = paginacao({ pageSize: '-5' }, { padrao: 10, teto: 100 });
    expect(p.pageSize).toBe(1);
  });

  it('page mínimo é 1 e skip acompanha', () => {
    expect(paginacao({ page: '0' }, {}).page).toBe(1);
    expect(paginacao({ page: '-3' }, {}).skip).toBe(0);
    expect(paginacao({ page: '3', pageSize: '10' }, {}).skip).toBe(20);
  });

  it('envelope() calcula pages pelo tamanho SERVIDO, não pelo pedido', () => {
    const e = envelope({ page: 1, pageSize: 100, pageSizeSolicitado: 500, total: 250, data: [] });
    expect(e.pages).toBe(3);
    expect(e.pageSizeSolicitado).toBe(500);
  });
});

/* ── as 8 rotas paginadas devolvem o campo ───────────────────────────────── */

let marcaId;

beforeEach(async () => {
  await prisma.conferencia_item.deleteMany();
  await prisma.conferencia_estoque.deleteMany();
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.garantias.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.marca.deleteMany();
  marcaId = (await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } })).id;
});

// [rota, teto, padrão]
const ROTAS = [
  ['/api/estoque', 100, 10],
  ['/api/estoque-som', 100, 10],
  ['/api/movimentacoes', 100, 10],
  ['/api/movimentacoes-som', 100, 10],
  ['/api/pedido-som', 100, 20],
  ['/api/garantias', 200, 50],
  ['/api/inventario/historico', 100, 20],
  ['/api/inventario/baterias/historico', 100, 10],
];

describe('envelope das rotas paginadas', () => {
  it.each(ROTAS)('%s corta em %i e diz que cortou', async (rota, teto) => {
    const { status, body } = await request(app).get(`${rota}?pageSize=9999`).set(authAdmin());
    expect(status).toBe(200);
    expect(body.pageSize).toBe(teto);
    expect(body.pageSizeSolicitado).toBe(9999);
    // é assim que um cliente detecta o corte, numa comparação só
    expect(body.pageSizeSolicitado > body.pageSize).toBe(true);
  });

  it.each(ROTAS)('%s sem corte: solicitado == servido', async (rota) => {
    const { body } = await request(app).get(`${rota}?pageSize=5`).set(authAdmin());
    expect(body.pageSize).toBe(5);
    expect(body.pageSizeSolicitado).toBe(5);
    expect(body.pageSizeSolicitado > body.pageSize).toBe(false);
  });

  it.each(ROTAS)('%s sem pageSize na query devolve o padrão da rota', async (rota, _teto, padrao) => {
    const { body } = await request(app).get(rota).set(authAdmin());
    expect(body.pageSize).toBe(padrao);
    expect(body.pageSizeSolicitado).toBe(padrao);
  });

  it.each(ROTAS)('%s mantém page/total/pages/data (campo é ADITIVO)', async (rota) => {
    const { body } = await request(app).get(rota).set(authAdmin());
    expect(body).toHaveProperty('page');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('pages');
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe('o corte continua acontecendo (só deixou de ser mudo)', () => {
  it('pedir 9999 num catálogo de 120 devolve 100 itens, não 120', async () => {
    for (let i = 0; i < 120; i++) {
      await prisma.estoque.create({
        data: {
          produto: `P${i}`, modelo: 'M', marca_id: marcaId,
          custo: 10, valor_venda: 20, qtd_minima: 0, qtd_inicial: 1, entradas: 0, saidas: 0,
        },
      });
    }

    const { body } = await request(app).get('/api/estoque?pageSize=9999').set(authAdmin());
    expect(body.data).toHaveLength(100);   // NÃO virou 400: o teto continua valendo
    expect(body.total).toBe(120);
    expect(body.pages).toBe(2);
    expect(body.pageSizeSolicitado).toBe(9999);
  });

  it('iterando as páginas (o que o front faz) vêm os 120', async () => {
    for (let i = 0; i < 120; i++) {
      await prisma.estoque.create({
        data: {
          produto: `P${i}`, modelo: 'M', marca_id: marcaId,
          custo: 10, valor_venda: 20, qtd_minima: 0, qtd_inicial: 1, entradas: 0, saidas: 0,
        },
      });
    }

    const todos = [];
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
      const { body } = await request(app).get(`/api/estoque?page=${page}&pageSize=100`).set(authAdmin());
      pages = body.pages;
      todos.push(...body.data);
    }
    expect(todos).toHaveLength(120);
    expect(new Set(todos.map((p) => p.id)).size).toBe(120); // sem repetição entre páginas
  });
});
