import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

// Token válido de um usuário real do banco (requireAuth resolve pelo id).
const tokenDe = (u) =>
  ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}` });

const novoUsuario = (extra = {}) => ({
  name: 'Fulano Operador',
  email: `fulano-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.local`,
  password: 'senha-forte-123',
  ...extra,
});

const criar = (body, auth = authAdmin()) =>
  request(app).post('/api/usuarios').set(auth).send(body);

beforeEach(async () => {
  // Preserva os usuários semeados (ids 1 e 2); remove só os criados pelos testes.
  await prisma.user.deleteMany({ where: { id: { notIn: [1, 2] } } });
});

describe('CRUD /api/usuarios (admin-only)', () => {
  it('usuário comum não acessa nada (403)', async () => {
    expect((await request(app).get('/api/usuarios').set(authUser())).status).toBe(403);
    expect((await criar(novoUsuario(), authUser())).status).toBe(403);
  });

  it('cria usuário com permissões, lista sem hash e devolve permissoes parseadas', async () => {
    const res = await criar(novoUsuario({ permissoes: { entrada_saida: true, ver_custo: true } }));
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('user');
    expect(res.body.data.permissoes).toEqual({ entrada_saida: true, ver_custo: true });
    expect(res.body.data.password).toBeUndefined();

    const lista = await request(app).get('/api/usuarios').set(authAdmin());
    expect(lista.status).toBe(200);
    const criado = lista.body.data.find((u) => u.id === res.body.data.id);
    expect(criado.permissoes.entrada_saida).toBe(true);
    expect(criado.password).toBeUndefined();
  });

  it('rejeita permissão fora do catálogo (400), senha curta (400) e email duplicado (409)', async () => {
    const chaveRuim = await criar(novoUsuario({ permissoes: { hackear_tudo: true } }));
    expect(chaveRuim.status).toBe(400);
    expect(chaveRuim.body.message).toMatch(/permissão desconhecida/i);

    expect((await criar(novoUsuario({ password: '1234567' }))).status).toBe(400);

    const u = novoUsuario();
    expect((await criar(u)).status).toBe(201);
    expect((await criar(u)).status).toBe(409);
  });

  it('PATCH edita permissões (e vale imediatamente, sem novo login)', async () => {
    // linha_baterias além da permissão: /movimentacoes é endpoint de linha (AND).
    const criado = (await criar(novoUsuario({ permissoes: { entrada_saida: true, linha_baterias: true } }))).body.data;

    // com a permissão: POST /movimentacoes passa do gate (400 = falta produto, não 403)
    const antes = await request(app).post('/api/movimentacoes').set(tokenDe(criado)).send({});
    expect(antes.status).not.toBe(403);

    const patch = await request(app)
      .patch(`/api/usuarios/${criado.id}`)
      .set(authAdmin())
      .send({ permissoes: {} });
    expect(patch.status).toBe(200);
    expect(patch.body.data.permissoes).toEqual({});

    // MESMO token de antes: a revogação já vale (403 no gate)
    const depois = await request(app).post('/api/movimentacoes').set(tokenDe(criado)).send({});
    expect(depois.status).toBe(403);
  });

  it('DELETE: não exclui a si próprio nem o último admin; exclui usuário comum', async () => {
    expect((await request(app).delete('/api/usuarios/1').set(authAdmin())).status).toBe(400); // a si próprio

    const criado = (await criar(novoUsuario())).body.data;
    expect((await request(app).delete(`/api/usuarios/${criado.id}`).set(authAdmin())).status).toBe(204);

    // token de usuário excluído morre na hora (401), mesmo dentro da validade do JWT
    expect((await request(app).get('/api/estoque').set(tokenDe(criado))).status).toBe(401);
  });
});

describe('permissão ver_custo (enforcement server-side)', () => {
  let marcaId;
  beforeEach(async () => {
    await prisma.movimentacoes.deleteMany();
    await prisma.estoque.deleteMany();
    await prisma.marca.deleteMany();
    marcaId = (await prisma.marca.create({ data: { nome: 'Moura' } })).id;
    await request(app).post('/api/estoque').set(authAdmin()).send({
      produto: 'Bateria 60Ah', modelo: 'BAT-60', marca_id: marcaId,
      custo: 200, valor_venda: 300, qtd_minima: 1, qtd_inicial: 5,
    });
  });

  it('sem ver_custo: GET /estoque omite custo/percentual_lucro; com ver_custo: devolve', async () => {
    const sem = await request(app).get('/api/estoque').set(authUser()); // seed: ver_custo=false
    expect(sem.status).toBe(200);
    expect(sem.body.data[0].custo).toBeUndefined();
    expect(sem.body.data[0].percentual_lucro).toBeUndefined();
    expect(sem.body.data[0].valor_venda).toBeDefined();

    // linha_baterias necessária para acessar /estoque (endpoint de linha).
    const comCusto = (await criar(novoUsuario({ permissoes: { ver_custo: true, linha_baterias: true } }))).body.data;
    const com = await request(app).get('/api/estoque').set(tokenDe(comCusto));
    expect(com.status).toBe(200);
    expect(Number(com.body.data[0].custo)).toBe(200);
  });

  it('/movimentacoes/resumo: custoVendido/lucroBruto só com ver_custo', async () => {
    const sem = await request(app).get('/api/movimentacoes/resumo').set(authUser());
    expect(sem.status).toBe(200);
    expect(sem.body.data.custoVendido).toBeUndefined();
    expect(sem.body.data.lucroBruto).toBeUndefined();

    const admin = await request(app).get('/api/movimentacoes/resumo').set(authAdmin());
    expect(admin.body.data.custoVendido).toBeDefined();
  });
});

describe('/api/auth/me', () => {
  it('devolve as permissões atuais do banco', async () => {
    const res = await request(app).get('/api/auth/me').set(authUser());
    expect(res.status).toBe(200);
    expect(res.body.user.permissoes.entrada_saida).toBe(true); // seed do setup
    expect(res.body.user.permissoes.ver_custo).toBeUndefined();
  });
});
