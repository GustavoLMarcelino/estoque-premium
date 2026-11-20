// Leitura de vendas exige a permissão da TELA, não só o login e a linha.
// Antes, um usuário com a linha Baterias e apenas "Tabela de Preços" conseguia
// ler todo o histórico de vendas (valor, vendedor, cliente do fiado) chamando a
// API direto — esconder o menu no front não protege nada.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

const tokenDe = (u) => ({
  Authorization: `Bearer ${jwt.sign(
    { id: u.id, email: u.email, role: u.role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  )}`,
});

let seq = 0;
/** Usuário comum com as DUAS linhas e só as permissões de tela informadas. */
async function usuarioCom(...telas) {
  seq += 1;
  return prisma.user.create({
    data: {
      name: `Perm ${seq}`,
      email: `perm-${Date.now()}-${seq}@t.local`,
      password: 'x',
      role: 'user',
      permissoes: JSON.stringify({
        linha_baterias: true,
        linha_som: true,
        ...Object.fromEntries(telas.map((t) => [t, true])),
      }),
    },
  });
}

const get = (rota, user) => request(app).get(rota).set(tokenDe(user));

beforeEach(async () => {
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.user.deleteMany({ where: { id: { notIn: [1, 2] } } });
});

describe('GET /api/movimentacoes e /api/movimentacoes-som — Home ou Reg. Movimentação', () => {
  const rotas = ['/api/movimentacoes', '/api/movimentacoes-som'];

  it('quem tem a linha mas só a tela Tabela de Preços recebe 403', async () => {
    const user = await usuarioCom('tabela_precos');
    for (const rota of rotas) {
      const res = await get(rota, user);
      expect(res.status, rota).toBe(403);
      expect(res.body.message).toMatch(/permissão/i);
    }
  });

  it('quem tem a tela Home lê as movimentações (quadro de últimas movimentações)', async () => {
    const user = await usuarioCom('home');
    for (const rota of rotas) {
      expect((await get(rota, user)).status, rota).toBe(200);
    }
  });

  it('quem tem a tela Reg. Movimentação lê as movimentações', async () => {
    const user = await usuarioCom('reg_movimentacao');
    for (const rota of rotas) {
      expect((await get(rota, user)).status, rota).toBe(200);
    }
  });
});

describe('GET /api/movimentacoes/resumo — só Dashboards', () => {
  it('quem tem Home e Reg. Movimentação, mas não Dashboards, recebe 403', async () => {
    const user = await usuarioCom('home', 'reg_movimentacao');
    expect((await get('/api/movimentacoes/resumo', user)).status).toBe(403);
  });

  it('quem tem a tela Dashboards lê o resumo', async () => {
    const user = await usuarioCom('dashboards');
    expect((await get('/api/movimentacoes/resumo', user)).status).toBe(200);
  });
});

describe('GET /api/pedido-som — só Reg. Movimentação', () => {
  it('quem tem só a Home não lê a lista nem um pedido pelo id', async () => {
    const pedido = await prisma.pedido_som.create({ data: { valor_total: '100.00' } });
    const user = await usuarioCom('home');
    expect((await get('/api/pedido-som', user)).status).toBe(403);
    expect((await get(`/api/pedido-som/${pedido.id}`, user)).status).toBe(403);
  });

  it('quem tem Reg. Movimentação lê a lista e o pedido pelo id', async () => {
    const pedido = await prisma.pedido_som.create({ data: { valor_total: '100.00' } });
    const user = await usuarioCom('reg_movimentacao');
    expect((await get('/api/pedido-som', user)).status).toBe(200);
    expect((await get(`/api/pedido-som/${pedido.id}`, user)).status).toBe(200);
  });
});

describe('GET /api/vendas-resumo — Home ou Dashboards', () => {
  it('quem tem só a tela de Estoque não vê o faturamento', async () => {
    const user = await usuarioCom('estoque_baterias', 'estoque_som');
    expect((await get('/api/vendas-resumo', user)).status).toBe(403);
  });

  it('quem tem a Home vê o resumo (card de vendas da semana)', async () => {
    const user = await usuarioCom('home');
    expect((await get('/api/vendas-resumo', user)).status).toBe(200);
  });

  it('quem tem Dashboards vê o resumo', async () => {
    const user = await usuarioCom('dashboards');
    expect((await get('/api/vendas-resumo', user)).status).toBe(200);
  });
});

describe('admin continua lendo tudo sem depender de permissão de tela', () => {
  it('admin recebe 200 em todas as rotas de leitura de vendas', async () => {
    for (const rota of [
      '/api/movimentacoes', '/api/movimentacoes-som', '/api/movimentacoes/resumo',
      '/api/pedido-som', '/api/vendas-resumo',
    ]) {
      expect((await request(app).get(rota).set(authAdmin())).status, rota).toBe(200);
    }
  });
});
