// Inventário exige a tela de Estoque DA LINHA, não só a linha. E cancelar uma
// conferência (que apaga a contagem inteira) é só para admin.
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
/** Usuário comum com exatamente as chaves informadas (linhas e telas). */
async function usuarioCom(...chaves) {
  seq += 1;
  return prisma.user.create({
    data: {
      name: `Inv ${seq}`,
      email: `inv-${Date.now()}-${seq}@t.local`,
      password: 'x',
      role: 'user',
      permissoes: JSON.stringify(Object.fromEntries(chaves.map((c) => [c, true]))),
    },
  });
}

beforeEach(async () => {
  await prisma.conferencia_item.deleteMany();
  await prisma.conferencia_estoque.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.user.deleteMany({ where: { id: { notIn: [1, 2] } } });
  const marca = await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } });
  await prisma.estoque.create({
    data: { produto: 'Bateria A', modelo: 'A-1', marca_id: marca.id, custo: '100', valor_venda: '150', qtd_minima: 1, qtd_inicial: 10, entradas: 0, saidas: 3 },
  });
});

const iniciarComo = (auth, linha = 'BATERIAS') => request(app).post(`/api/inventario/${linha}/iniciar`).set(auth);

describe('Inventário — quem tem a tela de Estoque da linha confere', () => {
  it('conferente com estoque_baterias inicia, confere um item e finaliza (201, 200, 200)', async () => {
    const conferente = tokenDe(await usuarioCom('linha_baterias', 'estoque_baterias'));

    const ini = await iniciarComo(conferente);
    expect(ini.status).toBe(201);
    const conf = ini.body.data;

    const item = await request(app).patch(`/api/inventario/item/${conf.itens[0].id}/conferir`).set(conferente);
    expect(item.status).toBe(200);

    const desfaz = await request(app).patch(`/api/inventario/item/${conf.itens[0].id}/desconferir`).set(conferente);
    expect(desfaz.status).toBe(200);

    const fin = await request(app).post(`/api/inventario/${conf.id}/finalizar`).set(conferente);
    expect(fin.status).toBe(200);

    // Depois de finalizada: histórico da linha e detalhe continuam abertos a ele.
    expect((await request(app).get('/api/inventario/BATERIAS/historico').set(conferente)).status).toBe(200);
    expect((await request(app).get(`/api/inventario/${conf.id}`).set(conferente)).status).toBe(200);
  });

  it('a tela de Estoque de OUTRA linha não libera: estoque_som não inicia inventário de Baterias', async () => {
    const user = tokenDe(await usuarioCom('linha_baterias', 'linha_som', 'estoque_som'));
    expect((await iniciarComo(user, 'BATERIAS')).status).toBe(403);
    expect((await iniciarComo(user, 'SOM')).status).toBe(201);
  });
});

describe('Inventário — só a linha, sem a tela de Estoque, recebe 403', () => {
  it('quem tem a linha e só Entrada e Saída não inicia, não confere, não finaliza e não lê o histórico', async () => {
    const conf = (await iniciarComo(authAdmin())).body.data;
    const semTela = tokenDe(await usuarioCom('linha_baterias', 'entrada_saida'));

    const tentativas = [
      await request(app).get('/api/inventario/BATERIAS/ativa').set(semTela),
      await request(app).patch(`/api/inventario/item/${conf.itens[0].id}/conferir`).set(semTela),
      await request(app).patch(`/api/inventario/item/${conf.itens[0].id}/desconferir`).set(semTela),
      await request(app).post(`/api/inventario/${conf.id}/finalizar`).set(semTela),
      await request(app).get('/api/inventario/BATERIAS/historico').set(semTela),
    ];
    for (const res of tentativas) {
      expect(res.status, `${res.req.method} ${res.req.path}`).toBe(403);
      expect(res.body.message).toMatch(/permissão/i);
    }

    // E não inicia uma nova (a do admin é cancelada antes para não dar 409).
    await request(app).delete(`/api/inventario/${conf.id}/cancelar`).set(authAdmin());
    expect((await iniciarComo(semTela)).status).toBe(403);

    // Detalhe de conferência finalizada também fica fechado.
    const outra = (await iniciarComo(authAdmin())).body.data;
    await request(app).post(`/api/inventario/${outra.id}/finalizar`).set(authAdmin());
    expect((await request(app).get(`/api/inventario/${outra.id}`).set(semTela)).status).toBe(403);
  });
});

describe('Inventário — consulta "tem conferência aberta?"', () => {
  it('quem tem só Reg. Movimentação consulta a conferência aberta (aviso da tela), mas não inicia', async () => {
    const user = tokenDe(await usuarioCom('linha_baterias', 'reg_movimentacao'));
    const res = await request(app).get('/api/inventario/BATERIAS/ativa').set(user);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect((await iniciarComo(user)).status).toBe(403);
  });
});

describe('Inventário — cancelar é só para admin', () => {
  it('conferente com a tela de Estoque não cancela (403) e a conferência continua aberta', async () => {
    const conferente = tokenDe(await usuarioCom('linha_baterias', 'estoque_baterias'));
    const conf = (await iniciarComo(conferente)).body.data;

    const res = await request(app).delete(`/api/inventario/${conf.id}/cancelar`).set(conferente);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/administradores/i);

    const ainda = await prisma.conferencia_estoque.findUnique({ where: { id: conf.id } });
    expect(ainda?.status).toBe('EM_ANDAMENTO');
  });

  it('admin cancela a conferência em andamento (204)', async () => {
    const conf = (await iniciarComo(authAdmin())).body.data;
    const res = await request(app).delete(`/api/inventario/${conf.id}/cancelar`).set(authAdmin());
    expect(res.status).toBe(204);
    expect(await prisma.conferencia_estoque.findUnique({ where: { id: conf.id } })).toBeNull();
  });
});
