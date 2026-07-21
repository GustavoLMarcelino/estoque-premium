import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

// Histórico de inventários finalizados: resumo congelado na finalização
// (itens, conferidos, divergências) + quem FINALIZOU.
// AUDITORIA PURA: registrar divergência NÃO altera em_estoque.

let marcaId;

beforeEach(async () => {
  await prisma.conferencia_item.deleteMany();
  await prisma.conferencia_estoque.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.marca.deleteMany();
  marcaId = (await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } })).id;
  // em_estoque: 10-3=7 e 5+2-1=6
  await prisma.estoque.create({
    data: { produto: 'Bateria A', modelo: 'A-1', marca_id: marcaId, custo: '100', valor_venda: '150', qtd_minima: 1, qtd_inicial: 10, entradas: 0, saidas: 3 },
  });
  await prisma.estoque.create({
    data: { produto: 'Bateria B', modelo: 'B-1', marca_id: marcaId, custo: '100', valor_venda: '150', qtd_minima: 1, qtd_inicial: 5, entradas: 2, saidas: 1 },
  });
});

const iniciar = () => request(app).post('/api/inventario/BATERIAS/iniciar').set(authAdmin());
const conferir = (itemId, body) => {
  const req = request(app).patch(`/api/inventario/item/${itemId}/conferir`).set(authAdmin());
  return body === undefined ? req.send() : req.send(body);
};
const finalizar = (id, auth = authAdmin) =>
  request(app).post(`/api/inventario/${id}/finalizar`).set(auth());

const emEstoqueAtual = async () => {
  const rows = await prisma.estoque.findMany({ orderBy: { id: 'asc' } });
  return rows.map((p) => Number(p.qtd_inicial) + Number(p.entradas) - Number(p.saidas));
};

describe('PATCH conferir — quantidade contada', () => {
  it('sem body = "bateu": grava qtd_contada igual ao qtd_sistema', async () => {
    const conf = (await iniciar()).body.data;
    const item = conf.itens[0];
    const res = await conferir(item.id);
    expect(res.status).toBe(200);
    expect(res.body.data.qtd_contada).toBe(item.qtd_sistema);
    expect(res.body.data.conferido).toBe(true);
  });

  it('com qtd_contada = "Divergiu": grava o número digitado', async () => {
    const conf = (await iniciar()).body.data;
    const item = conf.itens[0]; // qtd_sistema 7
    const res = await conferir(item.id, { qtd_contada: 4 });
    expect(res.status).toBe(200);
    expect(res.body.data.qtd_contada).toBe(4);
  });

  it('qtd_contada 0 é válida (contou e não achou nenhum)', async () => {
    const conf = (await iniciar()).body.data;
    const res = await conferir(conf.itens[0].id, { qtd_contada: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data.qtd_contada).toBe(0);
  });

  it('qtd_contada inválida (negativa/fracionada) → 400', async () => {
    const conf = (await iniciar()).body.data;
    expect((await conferir(conf.itens[0].id, { qtd_contada: -1 })).status).toBe(400);
    expect((await conferir(conf.itens[0].id, { qtd_contada: 2.5 })).status).toBe(400);
  });

  it('desconferir zera a qtd_contada (não deixa resíduo da marcação anterior)', async () => {
    const conf = (await iniciar()).body.data;
    const item = conf.itens[0];
    await conferir(item.id, { qtd_contada: 3 });
    const res = await request(app).patch(`/api/inventario/item/${item.id}/desconferir`).set(authAdmin());
    expect(res.status).toBe(200);
    expect(res.body.data.qtd_contada).toBeNull();
  });
});

describe('POST finalizar — resumo congelado', () => {
  it('finaliza com 0 divergências: totais corretos e em_estoque INTACTO', async () => {
    const antes = await emEstoqueAtual();
    const conf = (await iniciar()).body.data;
    for (const item of conf.itens) await conferir(item.id); // todos "bateu"

    const res = await finalizar(conf.id);
    expect(res.status).toBe(200);
    expect(res.body.data.total_itens).toBe(2);
    expect(res.body.data.total_conferidos).toBe(2);
    expect(res.body.data.total_divergencias).toBe(0);
    expect(await emEstoqueAtual()).toEqual(antes); // auditoria pura
  });

  it('finaliza com N divergências: conta só os itens que não bateram', async () => {
    const antes = await emEstoqueAtual();
    const conf = (await iniciar()).body.data;
    await conferir(conf.itens[0].id, { qtd_contada: conf.itens[0].qtd_sistema - 2 }); // diverge
    await conferir(conf.itens[1].id); // bate

    const res = await finalizar(conf.id);
    expect(res.status).toBe(200);
    expect(res.body.data.total_itens).toBe(2);
    expect(res.body.data.total_conferidos).toBe(2);
    expect(res.body.data.total_divergencias).toBe(1);
    expect(await emEstoqueAtual()).toEqual(antes); // divergência NÃO corrige estoque
  });

  it('grava quem FINALIZOU (não quem iniciou)', async () => {
    const conf = (await iniciar()).body.data;
    for (const item of conf.itens) await conferir(item.id);
    const res = await finalizar(conf.id);
    expect(res.body.data.finalizada_por).toBe('Admin Teste');
    expect(res.body.data.finalizada_por_id).toBe(1);
    expect(res.body.data.finalizada_at).toBeTruthy();
  });

  it('finalização dupla → 409 e não sobrescreve o primeiro resumo', async () => {
    const conf = (await iniciar()).body.data;
    await conferir(conf.itens[0].id, { qtd_contada: 1 });
    await conferir(conf.itens[1].id);
    const primeira = await finalizar(conf.id);
    expect(primeira.status).toBe(200);

    const segunda = await finalizar(conf.id);
    expect(segunda.status).toBe(409);

    const depois = await prisma.conferencia_estoque.findUnique({ where: { id: conf.id } });
    expect(depois.total_divergencias).toBe(1);
    expect(depois.finalizada_at).toEqual(primeira.body.data.finalizada_at != null
      ? new Date(primeira.body.data.finalizada_at)
      : depois.finalizada_at);
  });

  it('itens não conferidos não entram como divergência', async () => {
    const conf = (await iniciar()).body.data;
    await conferir(conf.itens[0].id); // só um conferido
    const res = await finalizar(conf.id);
    expect(res.body.data.total_itens).toBe(2);
    expect(res.body.data.total_conferidos).toBe(1);
    expect(res.body.data.total_divergencias).toBe(0);
  });
});

describe('GET /api/inventario/historico (admin)', () => {
  async function finalizada({ divergir = false } = {}) {
    const conf = (await iniciar()).body.data;
    await conferir(conf.itens[0].id, divergir ? { qtd_contada: 0 } : undefined);
    await conferir(conf.itens[1].id);
    await finalizar(conf.id);
    return conf.id;
  }

  it('admin recebe o resumo completo com linha e autor da finalização', async () => {
    await finalizada({ divergir: true });

    const res = await request(app).get('/api/inventario/historico').set(authAdmin());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const h = res.body.data[0];
    expect(h.linha).toBe('BATERIAS');
    expect(h.finalizada_por).toBe('Admin Teste');
    expect(h.total_divergencias).toBe(1);
    expect(h.total_itens).toBe(2);
  });

  it('NÃO-admin recebe 403 e nenhum número no corpo', async () => {
    await finalizada();
    const res = await request(app).get('/api/inventario/historico').set(authUser());
    expect(res.status).toBe(403);
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/total_|divergenc/);
  });

  it('sem token → 401', async () => {
    const res = await request(app).get('/api/inventario/historico');
    expect(res.status).toBe(401);
  });

  it('lista só FINALIZADA — conferência em andamento não aparece', async () => {
    await iniciar(); // fica EM_ANDAMENTO
    const res = await request(app).get('/api/inventario/historico').set(authAdmin());
    expect(res.body.total).toBe(0);
  });

  it('histórico POR LINHA segue aberto ao operador (não foi gateado em admin)', async () => {
    await finalizada();
    const res = await request(app).get('/api/inventario/BATERIAS/historico').set(authUser());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('conferência antiga (sem os campos novos) vem com null, sem inventar número', async () => {
    // Simula uma finalizada antes desta feature: totais e autor nulos.
    await prisma.conferencia_estoque.create({
      data: {
        linha: 'SOM', status: 'FINALIZADA', user_id: 1, created_by: 'Antigo',
        finalizada_at: new Date('2026-01-01T10:00:00Z'),
      },
    });

    const res = await request(app).get('/api/inventario/historico').set(authAdmin());
    const antiga = res.body.data.find((h) => h.created_by === 'Antigo');
    expect(antiga.total_itens).toBeNull();
    expect(antiga.total_divergencias).toBeNull();
    expect(antiga.finalizada_por).toBeNull();
  });
});
