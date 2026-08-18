import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

// Valor de venda imobilizado = Σ (valor_parcelado × em_estoque), somado NO
// SERVIDOR. Espelha estoqueResumoCusto.test.js, com uma diferença de desenho
// que é o ponto principal desta suíte: aqui NÃO há gate de ver_custo. Preço de
// venda já é público (a Tabela de Preços mostra, /api/estoque devolve), então
// esconder o total seria esconder do vendedor um número que ele já vê item a
// item. O escopo de LINHA continua valendo.

let marcaId;

async function criar(model, { custo = 1, valor_venda = 999, valor_parcelado, qtd_inicial, entradas = 0, saidas = 0 }) {
  return model.create({
    data: {
      produto: 'P', modelo: 'M', marca_id: marcaId,
      custo, valor_venda, qtd_minima: 0,
      ...(valor_parcelado !== undefined ? { valor_parcelado } : {}),
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

const buscar = (auth) => request(app).get('/api/estoque-resumo/venda').set(auth());

describe('GET /api/estoque-resumo/venda', () => {
  it('soma preço parcelado × quantidade por linha e devolve os TRÊS valores num payload só', async () => {
    // Baterias: 300×5 + 80×3 = 1740
    await criar(prisma.estoque, { valor_parcelado: 300, qtd_inicial: 5 });
    await criar(prisma.estoque, { valor_parcelado: 80, qtd_inicial: 3 });
    // Som: 150×2 = 300
    await criar(prisma.estoque_som, { valor_parcelado: 150, qtd_inicial: 2 });

    const { status, body } = await buscar(authAdmin);
    expect(status).toBe(200);
    expect(body.data.baterias.valor).toBeCloseTo(1740, 2);
    expect(body.data.som.valor).toBeCloseTo(300, 2);
    expect(body.data.total.valor).toBeCloseTo(2040, 2);
    expect(body.data.total.valor).toBeCloseTo(body.data.baterias.valor + body.data.som.valor, 2);
    expect(body.data.total.itens).toBe(10);
    expect(body.data.total.produtos).toBe(3);
  });

  it('é o preço PARCELADO, não o valor_venda legado nem o custo', async () => {
    await criar(prisma.estoque, { custo: 10, valor_venda: 999, valor_parcelado: 200, qtd_inicial: 1 });

    const { body } = await buscar(authAdmin);
    expect(body.data.total.valor).toBeCloseTo(200, 2);
  });

  it('valor_parcelado nulo cai em valor_venda (produto legado não vira R$ 0)', async () => {
    // Sem parcelado: entra pelos 400 do valor_venda. Sem o fallback somaria 0 e
    // o produto sumiria do total sem nenhum aviso na tela.
    await criar(prisma.estoque, { valor_venda: 400, valor_parcelado: null, qtd_inicial: 2 }); // 800
    await criar(prisma.estoque, { valor_venda: 999, valor_parcelado: 100, qtd_inicial: 1 }); // 100

    const { body } = await buscar(authAdmin);
    expect(body.data.baterias.valor).toBeCloseTo(900, 2);
    // o produto legado continua contando como produto e como unidades
    expect(body.data.baterias.produtos).toBe(2);
    expect(body.data.baterias.itens).toBe(3);
  });

  it('Som conta só o preço da peça — mão de obra não é imobilizado', async () => {
    // O imobilizado é o que está na prateleira: serviço não está em estoque.
    // A mão de obra vive em pedido_som_item, nunca no produto.
    await criar(prisma.estoque_som, { valor_parcelado: 100, qtd_inicial: 3 });

    const { body } = await buscar(authAdmin);
    expect(body.data.som.valor).toBeCloseTo(300, 2); // 100×3
  });

  it('usa o saldo real: entradas e saídas entram na quantidade', async () => {
    // 10 iniciais + 4 entradas − 6 saídas = 8 × R$ 25 = 200
    await criar(prisma.estoque, { valor_parcelado: 25, qtd_inicial: 10, entradas: 4, saidas: 6 });

    const { body } = await buscar(authAdmin);
    expect(body.data.baterias.valor).toBeCloseTo(200, 2);
    expect(body.data.baterias.itens).toBe(8);
  });

  it('saldo negativo não abate o total (piso em 0)', async () => {
    await criar(prisma.estoque, { valor_parcelado: 100, qtd_inicial: 1, saidas: 5 }); // −4
    await criar(prisma.estoque, { valor_parcelado: 100, qtd_inicial: 2 });            // +2 = 200

    const { body } = await buscar(authAdmin);
    expect(body.data.baterias.valor).toBeCloseTo(200, 2);
  });

  it('estoque vazio devolve zeros, não erro', async () => {
    const { status, body } = await buscar(authAdmin);
    expect(status).toBe(200);
    expect(body.data.total.valor).toBe(0);
    expect(body.data.total.itens).toBe(0);
  });

  it('SEM ver_custo: responde 200 com o valor (preço de venda não é dado sensível)', async () => {
    // O usuário 2 do seed tem as duas linhas e ver_custo = false. No /custo ele
    // toma 403; aqui ele PRECISA ver — é o desenho da rota, não um descuido.
    await criar(prisma.estoque, { valor_parcelado: 300, qtd_inicial: 2 });

    const { status, body } = await buscar(authUser);
    expect(status).toBe(200);
    expect(body.data.total.valor).toBeCloseTo(600, 2);
  });

  it('não devolve custo nem em campo escondido', async () => {
    await criar(prisma.estoque, { custo: 777, valor_parcelado: 300, qtd_inicial: 1 });

    const res = await buscar(authUser);
    expect(JSON.stringify(res.body)).not.toMatch(/777|custo/);
  });

  it('sem autenticação: 401', async () => {
    const res = await request(app).get('/api/estoque-resumo/venda');
    expect(res.status).toBe(401);
  });
});

describe('escopo de linha no resumo de venda', () => {
  it('usuário só de baterias não recebe o valor do Som e o total ignora o Som', async () => {
    await criar(prisma.estoque, { valor_parcelado: 100, qtd_inicial: 2 });     // 200
    await criar(prisma.estoque_som, { valor_parcelado: 500, qtd_inicial: 4 }); // 2000 — invisível

    const u = await prisma.user.update({
      where: { id: 2 },
      data: { permissoes: JSON.stringify({ linha_baterias: true }) },
    });
    expect(u.id).toBe(2);

    const { status, body } = await buscar(authUser);
    expect(status).toBe(200);
    expect(body.data.baterias.valor).toBeCloseTo(200, 2);
    expect(body.data.som).toBeNull();
    expect(body.data.total.valor).toBeCloseTo(200, 2); // Som não entra no total
  });

  it('usuário sem nenhuma linha recebe as duas faces null e total zerado', async () => {
    await criar(prisma.estoque, { valor_parcelado: 100, qtd_inicial: 2 });
    await criar(prisma.estoque_som, { valor_parcelado: 500, qtd_inicial: 4 });

    await prisma.user.update({ where: { id: 2 }, data: { permissoes: JSON.stringify({}) } });

    const { status, body } = await buscar(authUser);
    expect(status).toBe(200);
    expect(body.data.baterias).toBeNull();
    expect(body.data.som).toBeNull();
    expect(body.data.total.valor).toBe(0);
  });
});
