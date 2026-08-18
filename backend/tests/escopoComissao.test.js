import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

const tokenDe = (u) => ({
  Authorization: `Bearer ${jwt.sign(
    { id: u.id, email: u.email, role: u.role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  )}`,
});

// Usuários com escopo de UMA linha só (não-admin), criados por teste.
let bateriasOnly, somOnly;

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { id: { notIn: [1, 2] } } });
  bateriasOnly = await prisma.user.create({
    data: {
      name: 'Baterias Only', email: `bat-${Date.now()}@t.local`, password: 'x', role: 'user',
      permissoes: JSON.stringify({
        estoque_baterias: true, entrada_saida: true, reg_movimentacao: true,
        garantia: true, consulta_garantia: true, emprestimos: true, linha_baterias: true,
      }),
    },
  });
  somOnly = await prisma.user.create({
    data: {
      name: 'Som Only', email: `som-${Date.now()}@t.local`, password: 'x', role: 'user',
      permissoes: JSON.stringify({
        estoque_som: true, orcamento: true, entrada_saida: true, reg_movimentacao: true,
        linha_som: true,
      }),
    },
  });
});

describe('Escopo de linha — enforcement server-side', () => {
  it('usuário baterias-only: 200 em baterias, 403 em TODOS os endpoints de Som', async () => {
    expect((await request(app).get('/api/estoque').set(tokenDe(bateriasOnly))).status).toBe(200);
    for (const rota of ['/api/estoque-som', '/api/movimentacoes-som', '/api/pedido-som']) {
      const res = await request(app).get(rota).set(tokenDe(bateriasOnly));
      expect(res.status, `${rota} deveria ser 403`).toBe(403);
      expect(res.body.message).toMatch(/linha de som/i);
    }
  });

  it('usuário som-only: 200 em Som, 403 nos endpoints de Baterias', async () => {
    expect((await request(app).get('/api/estoque-som').set(tokenDe(somOnly))).status).toBe(200);
    for (const rota of ['/api/estoque', '/api/movimentacoes', '/api/garantias']) {
      const res = await request(app).get(rota).set(tokenDe(somOnly));
      expect(res.status, `${rota} deveria ser 403`).toBe(403);
      expect(res.body.message).toMatch(/linha de baterias/i);
    }
  });

  it('admin bypassa o escopo de linha (200 nas duas)', async () => {
    expect((await request(app).get('/api/estoque').set(authAdmin())).status).toBe(200);
    expect((await request(app).get('/api/estoque-som').set(authAdmin())).status).toBe(200);
  });

  it('inventário: linha enforçada por request (baterias-only não inicia conferência de Som)', async () => {
    expect((await request(app).post('/api/inventario/BATERIAS/iniciar').set(tokenDe(bateriasOnly))).status).not.toBe(403);
    const somInv = await request(app).get('/api/inventario/SOM/ativa').set(tokenDe(bateriasOnly));
    expect(somInv.status).toBe(403);
  });
});

describe('Comissão — exclusiva de admin', () => {
  it('não-admin (mesmo com todas as permissões e as duas linhas) toma 403 em /api/comissao/*', async () => {
    for (const rota of ['/api/comissao/config', '/api/comissao/painel', '/api/comissao/periodos']) {
      expect((await request(app).get(rota).set(authUser())).status, rota).toBe(403);
    }
  });

  it('admin acessa a config de comissão (200)', async () => {
    expect((await request(app).get('/api/comissao/config').set(authAdmin())).status).toBe(200);
  });
});

describe('Pedido Som — comissão sanitizada para não-admin', () => {
  async function criarPedidoComComissao() {
    return prisma.pedido_som.create({
      data: {
        valor_total: '300.00',
        valor_mao_obra: '200.00',
        valor_mao_obra_insulfilme: '50.00',
        comissao_joel: '60.00',
      },
    });
  }

  it('admin vê comissao_joel/valor_mao_obra; não-admin (som) NÃO', async () => {
    await criarPedidoComComissao();

    const admin = await request(app).get('/api/pedido-som').set(authAdmin());
    expect(admin.status).toBe(200);
    const pAdmin = admin.body.data[0];
    expect(pAdmin.comissao_joel).toBeDefined();
    expect(pAdmin.valor_mao_obra).toBeDefined();

    // authUser (id2) é não-admin e tem linha_som → passa o requireLinha mas
    // recebe o pedido SEM os campos de comissão/mão de obra.
    const user = await request(app).get('/api/pedido-som').set(authUser());
    expect(user.status).toBe(200);
    const pUser = user.body.data[0];
    expect(pUser.comissao_joel).toBeUndefined();
    expect(pUser.valor_mao_obra).toBeUndefined();
    expect(pUser.valor_mao_obra_insulfilme).toBeUndefined();
    expect(pUser.valor_total).toBe('300'); // total continua visível
  });

  it('GET /:id também sanitiza para não-admin', async () => {
    const pedido = await criarPedidoComComissao();
    const user = await request(app).get(`/api/pedido-som/${pedido.id}`).set(authUser());
    expect(user.status).toBe(200);
    expect(user.body.data.comissao_joel).toBeUndefined();
  });
});

describe('Catálogo de permissões — chave desconhecida rejeitada', () => {
  const novo = (permissoes) => ({
    name: 'Teste Chave', email: `chave-${Date.now()}-${Math.random().toString(36).slice(2)}@t.local`,
    password: 'senha-forte-123', permissoes,
  });

  it("'comissoes' (removida do catálogo) agora é rejeitada com 400", async () => {
    const res = await request(app).post('/api/usuarios').set(authAdmin()).send(novo({ comissoes: true }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/desconhecida/i);
  });

  it('as chaves de linha são aceitas', async () => {
    const res = await request(app).post('/api/usuarios').set(authAdmin())
      .send(novo({ estoque_baterias: true, linha_baterias: true }));
    expect(res.status).toBe(201);
    expect(res.body.data.permissoes.linha_baterias).toBe(true);
  });
});
