import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

let marcaId;

beforeEach(async () => {
  await prisma.conferencia_item.deleteMany();
  await prisma.conferencia_estoque.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.marca.deleteMany();
  marcaId = (await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } })).id;
  // 2 produtos com em_estoque conhecido: 10-3=7 e 5+2-1=6
  await prisma.estoque.create({
    data: { produto: 'Bateria A', modelo: 'A-1', marca_id: marcaId, custo: '100', valor_venda: '150', qtd_minima: 1, qtd_inicial: 10, entradas: 0, saidas: 3 },
  });
  await prisma.estoque.create({
    data: { produto: 'Bateria B', modelo: 'B-1', marca_id: marcaId, custo: '100', valor_venda: '150', qtd_minima: 1, qtd_inicial: 5, entradas: 2, saidas: 1 },
  });
});

const iniciar = (linha = 'BATERIAS') => request(app).post(`/api/inventario/${linha}/iniciar`).set(authAdmin());

describe('POST /api/inventario/:linha/iniciar', () => {
  it('cria conferência com snapshot de todos os produtos e qtd_sistema = em_estoque derivado', async () => {
    const res = await iniciar();
    expect(res.status).toBe(201);
    const itens = res.body.data.itens;
    expect(itens).toHaveLength(2);
    const byNome = Object.fromEntries(itens.map((i) => [i.produto, i]));
    expect(byNome['Bateria A'].qtd_sistema).toBe(7); // 10 - 3
    expect(byNome['Bateria B'].qtd_sistema).toBe(6); // 5 + 2 - 1
    expect(byNome['Bateria A'].em_estoque).toBe(7);
    expect(byNome['Bateria B'].em_estoque).toBe(6);
  });

  it('linha inválida → 400', async () => {
    const res = await iniciar('INVALIDA');
    expect(res.status).toBe(400);
  });

  it('já existe conferência ativa na linha → 409', async () => {
    await iniciar();
    const segunda = await iniciar();
    expect(segunda.status).toBe(409);
  });
});

describe('PATCH conferir / desconferir', () => {
  it('marca e desmarca um item', async () => {
    const conf = (await iniciar()).body.data;
    const item = conf.itens[0];

    const conferir = await request(app).patch(`/api/inventario/item/${item.id}/conferir`).set(authAdmin());
    expect(conferir.status).toBe(200);
    expect(conferir.body.data.conferido).toBe(true);
    expect(conferir.body.data.conferido_at).toBeTruthy();

    const desconferir = await request(app).patch(`/api/inventario/item/${item.id}/desconferir`).set(authAdmin());
    expect(desconferir.status).toBe(200);
    expect(desconferir.body.data.conferido).toBe(false);
    expect(desconferir.body.data.conferido_at).toBeNull();
  });

  it('item inexistente → 404', async () => {
    const res = await request(app).patch('/api/inventario/item/99999/conferir').set(authAdmin());
    expect(res.status).toBe(404);
  });
});

describe('POST finalizar / DELETE cancelar', () => {
  it('finaliza a conferência; finalizar de novo → 409', async () => {
    const conf = (await iniciar()).body.data;
    const fin = await request(app).post(`/api/inventario/${conf.id}/finalizar`).set(authAdmin());
    expect(fin.status).toBe(200);
    expect(fin.body.data.status).toBe('FINALIZADA');
    expect(fin.body.data.finalizada_at).toBeTruthy();

    const denovo = await request(app).post(`/api/inventario/${conf.id}/finalizar`).set(authAdmin());
    expect(denovo.status).toBe(409);
  });

  it('PATCH em item de conferência FINALIZADA → 409 (não aceita mais alteração)', async () => {
    const conf = (await iniciar()).body.data;
    const item = conf.itens[0];
    await request(app).post(`/api/inventario/${conf.id}/finalizar`).set(authAdmin());

    const res = await request(app).patch(`/api/inventario/item/${item.id}/conferir`).set(authAdmin());
    expect(res.status).toBe(409);
    // e o item não foi alterado
    const doBanco = await prisma.conferencia_item.findUnique({ where: { id: item.id } });
    expect(doBanco.conferido).toBe(false);
  });

  it('cancelar só EM_ANDAMENTO; cancelar finalizada → 409', async () => {
    const conf = (await iniciar()).body.data;
    await request(app).post(`/api/inventario/${conf.id}/finalizar`).set(authAdmin());
    const res = await request(app).delete(`/api/inventario/${conf.id}/cancelar`).set(authAdmin());
    expect(res.status).toBe(409);
  });

  it('conferência não altera o em_estoque dos produtos (é só checklist)', async () => {
    const conf = (await iniciar()).body.data;
    const item = conf.itens.find((i) => i.produto === 'Bateria A');
    await request(app).patch(`/api/inventario/item/${item.id}/conferir`).set(authAdmin());
    await request(app).post(`/api/inventario/${conf.id}/finalizar`).set(authAdmin());
    // em_estoque do produto segue derivado do estoque, intocado pela conferência
    const prod = await prisma.estoque.findFirst({ where: { produto: 'Bateria A' } });
    expect(Number(prod.qtd_inicial) + Number(prod.entradas) - Number(prod.saidas)).toBe(7);
  });
});
