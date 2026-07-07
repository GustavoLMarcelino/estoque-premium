import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.marca.deleteMany();
});

const criar = (nome, auth = authAdmin()) =>
  request(app).post('/api/marcas').set(auth).send({ nome });

describe('CRUD de marcas', () => {
  it('cria e lista em ordem alfabética', async () => {
    await criar('Moura');
    await criar('Acdelco');
    const res = await request(app).get('/api/marcas').set(authUser());
    expect(res.status).toBe(200);
    expect(res.body.data.map((m) => m.nome)).toEqual(['Acdelco', 'Moura']);
  });

  it('duplicada (mesmo case-insensitive) → 409', async () => {
    await criar('Moura');
    const res = await criar('  moura ');
    expect(res.status).toBe(409);
  });

  it('não-admin não cria nem edita (403); mas lista normalmente', async () => {
    expect((await criar('Moura', authUser())).status).toBe(403);
    const m = (await criar('Moura')).body;
    const patch = await request(app).patch(`/api/marcas/${m.id}`).set(authUser()).send({ ativo: false });
    expect(patch.status).toBe(403);
    expect((await request(app).get('/api/marcas').set(authUser())).status).toBe(200);
  });

  it('desativada some da listagem padrão e aparece com ?todas=1', async () => {
    const m = (await criar('Moura')).body;
    await request(app).patch(`/api/marcas/${m.id}`).set(authAdmin()).send({ ativo: false });
    const ativas = await request(app).get('/api/marcas').set(authUser());
    expect(ativas.body.data).toHaveLength(0);
    const todas = await request(app).get('/api/marcas?todas=1').set(authUser());
    expect(todas.body.data).toHaveLength(1);
    expect(todas.body.data[0].ativo).toBe(false);
  });
});

describe('marca_id no produto', () => {
  const produtoBody = (marca_id) => ({
    produto: 'Bateria X', modelo: 'BX-60', marca_id,
    custo: '100.00', valor_venda: '150.00',
  });

  it('cria produto com marca ativa e a resposta da listagem inclui a marca', async () => {
    const m = (await criar('Moura')).body;
    const res = await request(app).post('/api/estoque').set(authAdmin()).send(produtoBody(m.id));
    expect(res.status).toBe(201);
    const lista = await request(app).get('/api/estoque').set(authAdmin());
    expect(lista.body.data[0].marca.nome).toBe('Moura');
  });

  it('sem marca_id → 400 (campo obrigatório)', async () => {
    const res = await request(app).post('/api/estoque').set(authAdmin()).send({
      produto: 'Bateria X', modelo: 'BX-60', custo: '100.00', valor_venda: '150.00',
    });
    expect(res.status).toBe(400);
  });

  it('marca inexistente ou desativada → 400', async () => {
    expect((await request(app).post('/api/estoque').set(authAdmin()).send(produtoBody(9999))).status).toBe(400);
    const m = (await criar('Moura')).body;
    await request(app).patch(`/api/marcas/${m.id}`).set(authAdmin()).send({ ativo: false });
    expect((await request(app).post('/api/estoque').set(authAdmin()).send(produtoBody(m.id))).status).toBe(400);
  });

  it('busca q= encontra por nome da marca', async () => {
    const m = (await criar('Moura')).body;
    await request(app).post('/api/estoque').set(authAdmin()).send(produtoBody(m.id));
    const res = await request(app).get('/api/estoque?q=mour').set(authAdmin());
    expect(res.body.total).toBe(1);
  });

  it('filtro marca_id= restringe a listagem', async () => {
    const m1 = (await criar('Moura')).body;
    const m2 = (await criar('Acdelco')).body;
    await request(app).post('/api/estoque').set(authAdmin()).send(produtoBody(m1.id));
    await request(app).post('/api/estoque').set(authAdmin()).send({ ...produtoBody(m2.id), modelo: 'BX-70' });
    const res = await request(app).get(`/api/estoque?marca_id=${m2.id}`).set(authAdmin());
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].marca.nome).toBe('Acdelco');
  });
});
