import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

// GET /api/estoque-resumo/criticos — produtos com saldo <= qtd_minima.
//
// O motivo desta rota existir é o corte: a Home filtrava no cliente sobre
// /api/estoque?pageSize=500, que o servidor clampa em 100. Com 148 produtos de
// Som em produção, 3 críticos não existiam para a Home. Por isso o teste mais
// importante daqui é o do catálogo grande — sem ele, os outros passariam
// mesmo com a rota paginada.

let marcaId;

async function criar(model, { qtd_inicial, qtd_minima, entradas = 0, saidas = 0, produto = 'P', modelo = 'M' }) {
  return model.create({
    data: {
      produto, modelo, marca_id: marcaId,
      custo: 10, valor_venda: 20, qtd_minima,
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

const buscar = (auth) => request(app).get('/api/estoque-resumo/criticos').set(auth());

describe('GET /api/estoque-resumo/criticos', () => {
  it('conta e lista por linha, com o total somando as duas', async () => {
    await criar(prisma.estoque, { qtd_inicial: 0, qtd_minima: 5 });      // crítico
    await criar(prisma.estoque, { qtd_inicial: 50, qtd_minima: 5 });     // ok
    await criar(prisma.estoque_som, { qtd_inicial: 1, qtd_minima: 3 });  // crítico

    const { status, body } = await buscar(authAdmin);
    expect(status).toBe(200);
    expect(body.data.baterias.quantidade).toBe(1);
    expect(body.data.som.quantidade).toBe(1);
    expect(body.data.total.quantidade).toBe(2);
    expect(body.data.total.itens).toHaveLength(2);
  });

  it('produto EXATAMENTE no mínimo já é crítico (<=, não <)', async () => {
    await criar(prisma.estoque, { qtd_inicial: 5, qtd_minima: 5 });  // igual → crítico
    await criar(prisma.estoque, { qtd_inicial: 6, qtd_minima: 5 });  // acima  → não

    const { body } = await buscar(authAdmin);
    expect(body.data.baterias.quantidade).toBe(1);
    expect(body.data.baterias.itens[0].em_estoque).toBe(5);
  });

  it('mínimo 0 com estoque 0 é crítico; mínimo 0 com estoque 1 não é', async () => {
    await criar(prisma.estoque, { qtd_inicial: 0, qtd_minima: 0 });
    await criar(prisma.estoque, { qtd_inicial: 1, qtd_minima: 0 });

    const { body } = await buscar(authAdmin);
    expect(body.data.baterias.quantidade).toBe(1);
  });

  it('usa o saldo real: entradas e saídas entram na conta', async () => {
    // 10 + 0 − 8 = 2, abaixo do mínimo 5
    await criar(prisma.estoque, { qtd_inicial: 10, qtd_minima: 5, saidas: 8 });
    // 1 + 9 − 0 = 10, acima do mínimo 5
    await criar(prisma.estoque, { qtd_inicial: 1, qtd_minima: 5, entradas: 9 });

    const { body } = await buscar(authAdmin);
    expect(body.data.baterias.quantidade).toBe(1);
    expect(body.data.baterias.itens[0].em_estoque).toBe(2);
  });

  it('saldo NEGATIVO aparece como negativo, não maquiado em zero', async () => {
    // Ao contrário da soma de imobilizado (que tem piso em 0 para não abater o
    // total), aqui o número negativo é a informação: sinaliza inconsistência
    // para quem vai repor.
    await criar(prisma.estoque, { qtd_inicial: 1, qtd_minima: 2, saidas: 5 }); // −4

    const { body } = await buscar(authAdmin);
    expect(body.data.baterias.quantidade).toBe(1);
    expect(body.data.baterias.itens[0].em_estoque).toBe(-4);
  });

  it('os itens trazem os campos que o modal usa', async () => {
    await criar(prisma.estoque, { produto: 'Bateria 60Ah', modelo: 'BAT-60', qtd_inicial: 1, qtd_minima: 4 });

    const { body } = await buscar(authAdmin);
    const item = body.data.total.itens[0];
    expect(item).toMatchObject({
      linha: 'baterias',
      produto: 'Bateria 60Ah',
      modelo: 'BAT-60',
      em_estoque: 1,
      qtd_minima: 4,
    });
    expect(item.id).toBeTypeOf('number');
  });

  it('o total lista Baterias antes de Som (a ordem que o modal agrupa)', async () => {
    await criar(prisma.estoque_som, { produto: 'Som', qtd_inicial: 0, qtd_minima: 1 });
    await criar(prisma.estoque, { produto: 'Bat', qtd_inicial: 0, qtd_minima: 1 });

    const { body } = await buscar(authAdmin);
    expect(body.data.total.itens.map((i) => i.linha)).toEqual(['baterias', 'som']);
  });

  // O TESTE QUE JUSTIFICA A ROTA. /api/estoque devolve no máximo 100 linhas por
  // página, ordenadas por id desc — os críticos mais ANTIGOS caíam fora. Aqui o
  // crítico é o primeiro produto criado (o id mais baixo) num catálogo de 120.
  it('catálogo acima de 100 produtos: o crítico mais ANTIGO não some', async () => {
    await criar(prisma.estoque_som, { produto: 'O antigo crítico', qtd_inicial: 0, qtd_minima: 3 });
    for (let i = 0; i < 119; i++) {
      await criar(prisma.estoque_som, { produto: `Novo ${i}`, qtd_inicial: 90, qtd_minima: 1 });
    }
    expect(await prisma.estoque_som.count()).toBe(120);

    const { body } = await buscar(authAdmin);
    expect(body.data.som.quantidade).toBe(1);
    expect(body.data.som.itens[0].produto).toBe('O antigo crítico');
  });

  it('nenhum crítico devolve lista vazia e zero, não erro', async () => {
    await criar(prisma.estoque, { qtd_inicial: 99, qtd_minima: 1 });

    const { status, body } = await buscar(authAdmin);
    expect(status).toBe(200);
    expect(body.data.total.quantidade).toBe(0);
    expect(body.data.total.itens).toEqual([]);
  });

  it('estoque vazio devolve zeros, não erro', async () => {
    const { status, body } = await buscar(authAdmin);
    expect(status).toBe(200);
    expect(body.data.total.quantidade).toBe(0);
  });

  it('SEM ver_custo: 200 — quantidade em estoque não é dado sensível', async () => {
    await criar(prisma.estoque, { qtd_inicial: 0, qtd_minima: 5 });

    const { status, body } = await buscar(authUser);
    expect(status).toBe(200);
    expect(body.data.total.quantidade).toBe(1);
  });

  it('não vaza custo nem preço junto com os itens', async () => {
    await criar(prisma.estoque, { qtd_inicial: 0, qtd_minima: 5 });

    const res = await buscar(authUser);
    const item = res.body.data.total.itens[0];
    expect(item.custo).toBeUndefined();
    expect(item.valor_venda).toBeUndefined();
    expect(item.percentual_lucro).toBeUndefined();
  });

  it('sem autenticação: 401', async () => {
    const res = await request(app).get('/api/estoque-resumo/criticos');
    expect(res.status).toBe(401);
  });
});

describe('escopo de linha nos críticos', () => {
  it('usuário só de baterias não recebe os críticos de Som nem no total', async () => {
    await criar(prisma.estoque, { qtd_inicial: 0, qtd_minima: 5 });
    await criar(prisma.estoque_som, { qtd_inicial: 0, qtd_minima: 5 }); // invisível

    await prisma.user.update({
      where: { id: 2 },
      data: { permissoes: JSON.stringify({ linha_baterias: true }) },
    });

    const { status, body } = await buscar(authUser);
    expect(status).toBe(200);
    expect(body.data.baterias.quantidade).toBe(1);
    expect(body.data.som).toBeNull();
    expect(body.data.total.quantidade).toBe(1);
    expect(body.data.total.itens.every((i) => i.linha === 'baterias')).toBe(true);
  });

  it('usuário sem nenhuma linha: as duas faces null e total zerado', async () => {
    await criar(prisma.estoque, { qtd_inicial: 0, qtd_minima: 5 });
    await criar(prisma.estoque_som, { qtd_inicial: 0, qtd_minima: 5 });

    await prisma.user.update({ where: { id: 2 }, data: { permissoes: JSON.stringify({}) } });

    const { body } = await buscar(authUser);
    expect(body.data.baterias).toBeNull();
    expect(body.data.som).toBeNull();
    expect(body.data.total.quantidade).toBe(0);
    expect(body.data.total.itens).toEqual([]);
  });
});
