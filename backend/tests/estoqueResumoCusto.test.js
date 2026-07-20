import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

// Custo imobilizado = Σ (custo × em_estoque), somado NO SERVIDOR e gateado por
// ver_custo. O usuário 2 do seed tem todos os módulos e as duas linhas, mas
// ver_custo = false — é exatamente o caso que não pode receber estes números.

let marcaId;

async function criar(model, { custo, qtd_inicial, entradas = 0, saidas = 0 }) {
  return model.create({
    data: {
      produto: 'P', modelo: 'M', marca_id: marcaId,
      custo, valor_venda: 999, qtd_minima: 0,
      qtd_inicial, entradas, saidas,
    },
  });
}

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.marca.deleteMany();
  marcaId = (await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } })).id;
});

const buscar = (auth) => request(app).get('/api/estoque-resumo/custo').set(auth());

describe('GET /api/estoque-resumo/custo', () => {
  it('soma custo × quantidade por linha e devolve os TRÊS valores num payload só', async () => {
    // Baterias: 200×5 + 50×3 = 1150
    await criar(prisma.estoque, { custo: 200, qtd_inicial: 5 });
    await criar(prisma.estoque, { custo: 50, qtd_inicial: 3 });
    // Som: 100×2 = 200
    await criar(prisma.estoque_som, { custo: 100, qtd_inicial: 2 });

    const { status, body } = await buscar(authAdmin);
    expect(status).toBe(200);
    expect(body.data.baterias.valor).toBeCloseTo(1150, 2);
    expect(body.data.som.valor).toBeCloseTo(200, 2);
    expect(body.data.total.valor).toBeCloseTo(1350, 2);
    // total = baterias + som, e as três faces vêm juntas (uma chamada só)
    expect(body.data.total.valor).toBeCloseTo(body.data.baterias.valor + body.data.som.valor, 2);
    expect(body.data.total.itens).toBe(10);
  });

  it('usa o saldo real: entradas e saídas entram na quantidade', async () => {
    // 10 iniciais + 4 entradas − 6 saídas = 8 × R$ 25 = 200
    await criar(prisma.estoque, { custo: 25, qtd_inicial: 10, entradas: 4, saidas: 6 });

    const { body } = await buscar(authAdmin);
    expect(body.data.baterias.valor).toBeCloseTo(200, 2);
    expect(body.data.baterias.itens).toBe(8);
  });

  it('é custo, não valor de venda', async () => {
    await criar(prisma.estoque, { custo: 10, qtd_inicial: 1 }); // valor_venda 999
    const { body } = await buscar(authAdmin);
    expect(body.data.total.valor).toBeCloseTo(10, 2);
  });

  it('saldo negativo não abate o imobilizado (piso em 0)', async () => {
    await criar(prisma.estoque, { custo: 100, qtd_inicial: 1, saidas: 5 }); // −4
    await criar(prisma.estoque, { custo: 100, qtd_inicial: 2 });            // +2 = 200

    const { body } = await buscar(authAdmin);
    expect(body.data.baterias.valor).toBeCloseTo(200, 2);
  });

  it('estoque vazio devolve zeros, não erro', async () => {
    const { status, body } = await buscar(authAdmin);
    expect(status).toBe(200);
    expect(body.data.total.valor).toBe(0);
    expect(body.data.total.itens).toBe(0);
  });

  it('SEM ver_custo: 403 e NENHUM número no corpo da resposta', async () => {
    await criar(prisma.estoque, { custo: 200, qtd_inicial: 5 });

    const res = await buscar(authUser);
    expect(res.status).toBe(403);
    expect(res.body.data).toBeUndefined();
    // nenhum valor vaza no corpo (nem o total, nem por linha)
    expect(JSON.stringify(res.body)).not.toMatch(/1000|200|valor/);
  });

  it('sem autenticação: 401', async () => {
    const res = await request(app).get('/api/estoque-resumo/custo');
    expect(res.status).toBe(401);
  });
});

describe('escopo de linha no resumo de custo', () => {
  it('usuário só de baterias não recebe o valor do Som e o total ignora o Som', async () => {
    await criar(prisma.estoque, { custo: 100, qtd_inicial: 2 });     // 200
    await criar(prisma.estoque_som, { custo: 500, qtd_inicial: 4 }); // 2000 — invisível

    const u = await prisma.user.update({
      where: { id: 2 },
      data: { permissoes: JSON.stringify({ ver_custo: true, linha_baterias: true }) },
    });
    expect(u.id).toBe(2);

    const { status, body } = await buscar(authUser);
    expect(status).toBe(200);
    expect(body.data.baterias.valor).toBeCloseTo(200, 2);
    expect(body.data.som).toBeNull();
    expect(body.data.total.valor).toBeCloseTo(200, 2); // Som não entra no total
  });
});
