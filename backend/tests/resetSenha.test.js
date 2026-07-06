import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';

const EMAIL = 'dono@premium.com';
const SENHA_ANTIGA = 'senha-antiga-123';

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

beforeEach(async () => {
  await prisma.user.deleteMany();
  await prisma.user.create({
    data: {
      name: 'Dono',
      email: EMAIL,
      password: await bcrypt.hash(SENHA_ANTIGA, 4), // custo baixo só p/ velocidade do teste
      role: 'admin',
    },
  });
});

afterEach(() => vi.restoreAllMocks());

describe('POST /api/auth/esqueci-senha', () => {
  it('email existente: resposta genérica e token (hash) salvo com expiração ~1h', async () => {
    const antes = Date.now();
    const res = await request(app).post('/api/auth/esqueci-senha').send({ email: EMAIL });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/se esse email existir/i);

    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    expect(user.reset_token).toMatch(/^[a-f0-9]{64}$/); // sha256 hex — nunca o token cru
    const ttlMin = (user.reset_token_expira.getTime() - antes) / 60000;
    expect(ttlMin).toBeGreaterThan(55);
    expect(ttlMin).toBeLessThan(65);
  });

  it('email inexistente: MESMA resposta genérica (sem enumeração de usuários)', async () => {
    const existente = await request(app).post('/api/auth/esqueci-senha').send({ email: EMAIL });
    const inexistente = await request(app).post('/api/auth/esqueci-senha').send({ email: 'ninguem@nada.com' });
    expect(inexistente.status).toBe(existente.status);
    expect(inexistente.body).toEqual(existente.body);
  });

  it('email malformado → 400 (Zod)', async () => {
    const res = await request(app).post('/api/auth/esqueci-senha').send({ email: 'nao-eh-email' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('email');
  });
});

describe('POST /api/auth/redefinir-senha', () => {
  // injeta um token conhecido direto no banco (o endpoint guarda só o hash)
  async function plantarToken({ expiraEmMs = 60 * 60 * 1000 } = {}) {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { email: EMAIL },
      data: { reset_token: hashToken(token), reset_token_expira: new Date(Date.now() + expiraEmMs) },
    });
    return token;
  }

  it('token válido: troca a senha (bcrypt), invalida o token e permite login novo', async () => {
    const token = await plantarToken();
    const res = await request(app).post('/api/auth/redefinir-senha').send({ token, senha: 'senha-nova-456' });
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    expect(user.reset_token).toBeNull();
    expect(user.reset_token_expira).toBeNull();
    expect(user.password).not.toBe(SENHA_ANTIGA);
    expect(await bcrypt.compare('senha-nova-456', user.password)).toBe(true);

    const loginNovo = await request(app).post('/api/auth/login').send({ email: EMAIL, password: 'senha-nova-456' });
    expect(loginNovo.status).toBe(200);
    const loginVelho = await request(app).post('/api/auth/login').send({ email: EMAIL, password: SENHA_ANTIGA });
    expect(loginVelho.status).toBe(401);
  });

  it('mesmo token usado uma segunda vez → 400', async () => {
    const token = await plantarToken();
    await request(app).post('/api/auth/redefinir-senha').send({ token, senha: 'senha-nova-456' });
    const denovo = await request(app).post('/api/auth/redefinir-senha').send({ token, senha: 'outra-senha-789' });
    expect(denovo.status).toBe(400);
    expect(denovo.body.message).toMatch(/inválido ou expirado/i);
  });

  it('token expirado → 400', async () => {
    const token = await plantarToken({ expiraEmMs: -1000 }); // já vencido
    const res = await request(app).post('/api/auth/redefinir-senha').send({ token, senha: 'senha-nova-456' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/inválido ou expirado/i);
  });

  it('token desconhecido → 400', async () => {
    const res = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ token: 'a'.repeat(64), senha: 'senha-nova-456' });
    expect(res.status).toBe(400);
  });

  it('senha curta demais → 400 (Zod)', async () => {
    const token = await plantarToken();
    const res = await request(app).post('/api/auth/redefinir-senha').send({ token, senha: '1234567' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('senha');
  });
});

describe('fluxo completo (E2E pelo caminho real)', () => {
  it('esqueci-senha → link logado pelo mailer em dev → redefinir → login', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await request(app).post('/api/auth/esqueci-senha').send({ email: EMAIL });
    await new Promise((r) => setTimeout(r, 50)); // envio do email é fire-and-forget

    const linha = spy.mock.calls.map((c) => c.join(' ')).find((l) => l.includes('token='));
    expect(linha).toBeTruthy();
    expect(linha).toContain('/redefinir-senha?token=');
    const token = /token=([a-f0-9]+)/.exec(linha)[1];

    const res = await request(app).post('/api/auth/redefinir-senha').send({ token, senha: 'senha-do-email-1' });
    expect(res.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: EMAIL, password: 'senha-do-email-1' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });
});
