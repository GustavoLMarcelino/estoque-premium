import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

let marcaId;

beforeEach(async () => {
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.classe_som.deleteMany();
  await prisma.marca.deleteMany();
  marcaId = (await prisma.marca.upsert({ where: { nome: 'JBL' }, update: {}, create: { nome: 'JBL' } })).id;
});

const criarClasse = (body, auth = authAdmin()) => request(app).post('/api/classes-som').set(auth).send(body);

describe('CRUD /api/classes-som', () => {
  it('cria classe com nome + valor_mao_obra', async () => {
    const res = await criarClasse({ nome: 'Rádio', valor_mao_obra: 50 });
    expect(res.status).toBe(201);
    expect(res.body.nome).toBe('Rádio');
    expect(Number(res.body.valor_mao_obra)).toBe(50);
    expect(res.body.ativo).toBe(true);
    expect(res.body.categoria).toBe('SOM'); // padrão
  });

  it('cria classe INSULFILME e filtra por categoria', async () => {
    await criarClasse({ nome: 'Rádio', valor_mao_obra: 50 }); // SOM (padrão)
    const insulf = await criarClasse({ nome: 'Insulfilme Padrão', valor_mao_obra: 380, categoria: 'INSULFILME' });
    expect(insulf.status).toBe(201);
    expect(insulf.body.categoria).toBe('INSULFILME');

    const som = (await request(app).get('/api/classes-som?categoria=SOM').set(authAdmin())).body.data;
    const filme = (await request(app).get('/api/classes-som?categoria=INSULFILME').set(authAdmin())).body.data;
    expect(som.map((c) => c.nome)).toContain('Rádio');
    expect(som.map((c) => c.nome)).not.toContain('Insulfilme Padrão');
    expect(filme.map((c) => c.nome)).toContain('Insulfilme Padrão');
    expect(filme.map((c) => c.nome)).not.toContain('Rádio');
  });

  it('duplicidade é case-insensitive → 409', async () => {
    await criarClasse({ nome: 'Alarme', valor_mao_obra: 200 });
    const dup = await criarClasse({ nome: 'alarme', valor_mao_obra: 999 });
    expect(dup.status).toBe(409);
  });

  it('valor_mao_obra inválido → 400', async () => {
    const res = await criarClasse({ nome: 'Vidro', valor_mao_obra: 'abc' });
    expect(res.status).toBe(400);
  });

  it('criar exige admin (403 para user comum)', async () => {
    const res = await criarClasse({ nome: 'Câmera', valor_mao_obra: 100 }, authUser());
    expect(res.status).toBe(403);
  });

  it('GET padrão só ativas; ?todas=1 inclui desativadas', async () => {
    const ativa = (await criarClasse({ nome: 'Mídia', valor_mao_obra: 150 })).body;
    const inativa = (await criarClasse({ nome: 'Anti-furto', valor_mao_obra: 80 })).body;
    await request(app).patch(`/api/classes-som/${inativa.id}`).set(authAdmin()).send({ ativo: false });

    const soAtivas = (await request(app).get('/api/classes-som').set(authAdmin())).body.data;
    expect(soAtivas.map((c) => c.id)).toContain(ativa.id);
    expect(soAtivas.map((c) => c.id)).not.toContain(inativa.id);

    const todas = (await request(app).get('/api/classes-som?todas=1').set(authAdmin())).body.data;
    expect(todas.map((c) => c.id)).toContain(inativa.id);
  });

  it('PATCH ajusta valor_mao_obra e desativa', async () => {
    const c = (await criarClasse({ nome: 'Sensor de ré', valor_mao_obra: 150 })).body;
    const res = await request(app).patch(`/api/classes-som/${c.id}`).set(authAdmin())
      .send({ valor_mao_obra: 175, ativo: false });
    expect(res.status).toBe(200);
    expect(Number(res.body.valor_mao_obra)).toBe(175);
    expect(res.body.ativo).toBe(false);
  });

  it('PATCH classe inexistente → 404', async () => {
    const res = await request(app).patch('/api/classes-som/99999').set(authAdmin()).send({ valor_mao_obra: 10 });
    expect(res.status).toBe(404);
  });
});

// M2 removeu a classe do produto de Som: a rota ignora classe_id no body e o
// GET não traz mais a relação de classe. (Cobertura detalhada em
// classeSomRemovida.test.js; aqui garantimos o contrato no arquivo da classe.)
describe('estoque-som ↔ classe (removido no M2 — produto não tem mais classe)', () => {
  const baseProduto = (extra = {}) => ({
    produto: 'Módulo', modelo: 'MOD-1', marca_id: marcaId,
    custo: 100, valor_venda: 150, qtd_minima: 1, qtd_inicial: 3, ...extra,
  });

  it('POST sem classe_id: produto fica sem classe (null)', async () => {
    const criado = await request(app).post('/api/estoque-som').set(authAdmin()).send(baseProduto());
    expect(criado.status).toBe(201);
    expect(criado.body.classe_id).toBeNull();
  });

  it('POST com classe_id no body é ignorado (produto criado sem classe)', async () => {
    const classe = (await criarClasse({ nome: 'Rádio', valor_mao_obra: 50 })).body;
    const criado = await request(app).post('/api/estoque-som').set(authAdmin()).send(baseProduto({ classe_id: classe.id }));
    expect(criado.status).toBe(201);
    expect(criado.body.classe_id).toBeNull();

    // GET não traz mais a relação de classe do produto
    const lista = (await request(app).get('/api/estoque-som').set(authAdmin())).body.data;
    const row = lista.find((p) => p.id === criado.body.id);
    expect(row.classe).toBeUndefined();
  });

  it('PUT com classe_id no body é ignorado (não vincula classe ao produto)', async () => {
    const classe = (await criarClasse({ nome: 'Mídia', valor_mao_obra: 150 })).body;
    const prod = (await request(app).post('/api/estoque-som').set(authAdmin()).send(baseProduto())).body;

    const res = await request(app).put(`/api/estoque-som/${prod.id}`).set(authAdmin())
      .send({ classe_id: classe.id, produto: 'Módulo X' });
    expect(res.status).toBe(200);
    expect(res.body.classe_id).toBeNull();
    expect(res.body.produto).toBe('Módulo X');
  });
});
