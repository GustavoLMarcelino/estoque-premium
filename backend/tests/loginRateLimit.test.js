import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

// Cria um usuário real (senha vira hash bcrypt) para poder testar login OK.
const SENHA = 'senha-forte-123';
async function criarUsuario(email) {
  const res = await request(app).post('/api/usuarios').set(authAdmin())
    .send({ name: 'Login Teste', email, password: SENHA, permissoes: { linha_baterias: true } });
  expect(res.status).toBe(201);
  return email;
}

const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { id: { notIn: [1, 2] } } });
});

describe('Rate limit do login (5/min por email+IP, reset no acerto)', () => {
  it('5 tentativas erradas passam (401); a 6ª é bloqueada (429)', async () => {
    const email = await criarUsuario(`rl-a-${Date.now()}@t.local`);
    for (let i = 0; i < 5; i += 1) {
      expect((await login(email, 'errada')).status).toBe(401);
    }
    const bloqueada = await login(email, 'errada');
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.message).toMatch(/aguarde 1 minuto/i);
  });

  it('acerto no meio ZERA o contador (não carrega as erradas anteriores)', async () => {
    const email = await criarUsuario(`rl-b-${Date.now()}@t.local`);
    // 4 erradas (ainda dentro do limite)
    for (let i = 0; i < 4; i += 1) expect((await login(email, 'errada')).status).toBe(401);
    // acerto → resetKey zera o contador
    expect((await login(email, SENHA)).status).toBe(200);
    // orçamento renovado: mais 5 erradas continuam passando como 401, sem 429
    for (let i = 0; i < 5; i += 1) expect((await login(email, 'errada')).status).toBe(401);
  });

  it('bloquear um email NÃO trava outro email do mesmo IP', async () => {
    const emailA = await criarUsuario(`rl-c-${Date.now()}@t.local`);
    const emailB = await criarUsuario(`rl-d-${Date.now()}@t.local`);
    // estoura o limite do A (6 tentativas → a última 429)
    for (let i = 0; i < 5; i += 1) await login(emailA, 'errada');
    expect((await login(emailA, 'errada')).status).toBe(429);
    // B (mesmo IP de teste) continua respondendo normalmente
    expect((await login(emailB, 'errada')).status).toBe(401);
    expect((await login(emailB, SENHA)).status).toBe(200);
  });
});
