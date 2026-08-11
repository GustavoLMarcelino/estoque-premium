import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

const produtoBase = {
  produto: 'Bateria Mov',
  modelo: 'BM-60',
  custo: '100.00',
  valor_venda: '150.00',
  qtd_minima: 1,
  qtd_inicial: 10, // disponível inicial = 10
  entradas: 0,
  saidas: 0,
};

let produtoId;

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque.deleteMany();
  const marca = await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } });
  produtoId = (await prisma.estoque.create({ data: { ...produtoBase, marca_id: marca.id } })).id;
});

const criarMov = (body, auth = authAdmin()) =>
  request(app).post('/api/movimentacoes').set(auth).send(body);

describe('POST /api/movimentacoes — transação de estoque', () => {
  it('saída maior que o disponível → 409, sem efeito colateral', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'saida', quantidade: 11 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/excede/i);
    expect(await prisma.movimentacoes.count()).toBe(0);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(0);
  });

  it('saída igual ao disponível (limite exato) → 201', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'saida', quantidade: 10 });
    expect(res.status).toBe(201);
  });

  it('entrada atualiza o agregado entradas', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 5 });
    expect(res.status).toBe(201);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.entradas).toBe(5);
    expect(p.saidas).toBe(0);
  });

  it('saída atualiza o agregado saidas e grava vendedor/valor unitário', async () => {
    const res = await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 4, valor_final: '151.64', vendedor: 'Ismael',
    });
    expect(res.status).toBe(201);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(4);
    const mov = await prisma.movimentacoes.findFirst();
    expect(mov.tipo).toBe('SAIDA');
    expect(mov.vendedor).toBe('Ismael');
    expect(Number(mov.valor_final)).toBeCloseTo(151.64, 2);
  });

  it('usuário comum pode registrar movimentação (POST liberado)', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 1 }, authUser());
    expect(res.status).toBe(201);
  });
});

describe('DELETE /api/movimentacoes/:id — reversão de agregados e autorização', () => {
  it('excluir uma ENTRADA reverte o agregado entradas (admin → 204)', async () => {
    const mov = (await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 5 })).body;
    const res = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(res.status).toBe(204);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.entradas).toBe(0);
    expect(await prisma.movimentacoes.count()).toBe(0);
  });

  it('excluir uma SAÍDA reverte o agregado saidas (admin → 204)', async () => {
    const mov = (await criarMov({ produto_id: produtoId, tipo: 'saida', quantidade: 3 })).body;
    const res = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(res.status).toBe(204);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(0);
  });

  it('usuário comum não pode excluir → 403 e nada muda', async () => {
    const mov = (await criarMov({ produto_id: produtoId, tipo: 'saida', quantidade: 3 })).body;
    const res = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authUser());
    expect(res.status).toBe(403);
    expect(await prisma.movimentacoes.count()).toBe(1);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(3);
  });
});

// O campo "valor unitário" saiu das telas de ENTRADA (era gravado e nunca
// consumido por cálculo nenhum). Na SAÍDA ele é a RECEITA — a Home soma esse
// valor —, então continua sendo enviado e gravado. Estes testes travam os dois
// lados da linha que separa a limpeza de uma regressão de faturamento.
describe('valor_final: ausente na entrada, preservado na saída', () => {
  it('ENTRADA sem valor_final → 201 e grava o default 0.00', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 4 });
    expect(res.status).toBe(201);
    const mov = await prisma.movimentacoes.findFirst({ orderBy: { id: 'desc' } });
    expect(mov.tipo).toBe('ENTRADA');
    expect(Number(mov.valor_final)).toBe(0);
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.entradas).toBe(4); // o estoque sobe do mesmo jeito
  });

  it('SAÍDA com valor_final → receita gravada intacta (NÃO regrediu)', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'saida', quantidade: 2, valor_final: '150.00' });
    expect(res.status).toBe(201);
    const mov = await prisma.movimentacoes.findFirst({ orderBy: { id: 'desc' } });
    expect(mov.tipo).toBe('SAIDA');
    expect(Number(mov.valor_final)).toBe(150);
  });
});

/* ─────────────────── status de pagamento (fiado) ─────────────────── */

// FIADO é a venda em que o cliente leva agora e paga depois. Ela entra no
// faturamento na SAÍDA como qualquer outra (competência) — o que muda é só
// saber que o dinheiro ainda não entrou.
describe('POST — status_pagamento', () => {
  const ultima = () => prisma.movimentacoes.findFirst({ orderBy: { id: 'desc' } });

  it('venda sem o campo nasce PAGO (o caso normal não exige nada de quem lança)', async () => {
    const res = await criarMov({ produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 150, forma_pagamento: 'pix' });
    expect(res.status).toBe(201);
    const mov = await ultima();
    expect(mov.status_pagamento).toBe('PAGO');
    expect(mov.data_pagamento).toBeNull();
  });

  it('venda FIADO grava FIADO, sem forma de pagamento e sem data', async () => {
    const res = await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 2, valor_final: 200,
      status_pagamento: 'FIADO', cliente_fiado: 'Maria Silva',
    });
    expect(res.status).toBe(201);
    const mov = await ultima();
    expect(mov.status_pagamento).toBe('FIADO');
    expect(mov.forma_pagamento).toBeNull();
    // Quitar é sempre um segundo ato: nascer com data faria "vendido em" e
    // "quitado em" virarem o mesmo dado.
    expect(mov.data_pagamento).toBeNull();
  });

  it('fiado dá baixa no estoque como qualquer venda', async () => {
    await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 3, valor_final: 150,
      status_pagamento: 'FIADO', cliente_fiado: 'Maria Silva',
    });
    const p = await prisma.estoque.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(3);
  });

  it('ENTRADA ignora status E nome, gravando PAGO sem cliente (compra do fornecedor não é fiado daqui)', async () => {
    const res = await criarMov({
      produto_id: produtoId, tipo: 'entrada', quantidade: 5,
      status_pagamento: 'FIADO', cliente_fiado: 'Fornecedor X',
    });
    expect(res.status).toBe(201);
    const mov = await ultima();
    expect(mov.status_pagamento).toBe('PAGO');
    // Sem isto, uma entrada guardaria nome de "devedor" numa linha que não é
    // dívida de ninguém — e o filtro de fiados nunca a mostraria para corrigir.
    expect(mov.cliente_fiado).toBeNull();
  });

  it('valor fora do enum é recusado (400), sem gravar', async () => {
    const res = await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 150,
      status_pagamento: 'TALVEZ',
    });
    expect(res.status).toBe(400);
    expect(await prisma.movimentacoes.count()).toBe(0);
  });

  it('não-admin com permissão de entrada/saída também lança fiado', async () => {
    const res = await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 150,
      status_pagamento: 'FIADO', cliente_fiado: 'Maria Silva',
    }, authUser());
    expect(res.status).toBe(201);
    expect((await ultima()).status_pagamento).toBe('FIADO');
  });
});

describe('POST — cliente_fiado', () => {
  const ultima = () => prisma.movimentacoes.findFirst({ orderBy: { id: 'desc' } });

  it('FIADO sem nome do cliente → 400, sem gravar nem baixar estoque', async () => {
    const res = await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 150,
      status_pagamento: 'FIADO',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/nome do cliente/i);
    expect(await prisma.movimentacoes.count()).toBe(0);
    // 400 é no schema, antes da transação: o estoque não pode ter sido tocado.
    expect((await prisma.estoque.findUnique({ where: { id: produtoId } })).saidas).toBe(0);
  });

  it('FIADO com nome só de espaços → 400 (branco não é nome)', async () => {
    const res = await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 150,
      status_pagamento: 'FIADO', cliente_fiado: '   ',
    });
    expect(res.status).toBe(400);
    expect(await prisma.movimentacoes.count()).toBe(0);
  });

  it('FIADO com nome → 201 e grava o nome já sem espaços nas pontas', async () => {
    const res = await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 150,
      status_pagamento: 'FIADO', cliente_fiado: '  Maria Silva  ',
    });
    expect(res.status).toBe(201);
    expect((await ultima()).cliente_fiado).toBe('Maria Silva');
  });

  it('venda PAGO descarta o nome mesmo se vier preenchido', async () => {
    const res = await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 150,
      forma_pagamento: 'pix', cliente_fiado: 'Maria Silva',
    });
    expect(res.status).toBe(201);
    // Nome em linha que não deve nada é sujeira: depois ninguém sabe dizer se
    // aquilo foi dívida ou resto de payload.
    expect((await ultima()).cliente_fiado).toBeNull();
  });

  it('venda normal (sem nenhum dos dois campos) nasce sem cliente', async () => {
    const res = await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 150, forma_pagamento: 'pix',
    });
    expect(res.status).toBe(201);
    expect((await ultima()).cliente_fiado).toBeNull();
  });

  it('nome acima de 150 caracteres → 400 (o limite é o da coluna no MySQL)', async () => {
    const res = await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 150,
      status_pagamento: 'FIADO', cliente_fiado: 'x'.repeat(151),
    });
    expect(res.status).toBe(400);
    expect(await prisma.movimentacoes.count()).toBe(0);
  });
});

describe('GET /api/movimentacoes — filtro status_pagamento', () => {
  // Duas fiado e duas pagas, para que o filtro tenha o que descartar nos dois
  // sentidos (um filtro que devolve tudo passaria num cenário só de fiados).
  beforeEach(async () => {
    await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 100,
      status_pagamento: 'FIADO', cliente_fiado: 'Maria Silva',
    });
    await criarMov({ produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 100, forma_pagamento: 'pix' });
    await criarMov({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 100,
      status_pagamento: 'FIADO', cliente_fiado: 'João Souza',
    });
    await criarMov({ produto_id: produtoId, tipo: 'entrada', quantidade: 5 });
  });

  const listar = (qs = '') => request(app).get(`/api/movimentacoes${qs}`).set(authAdmin());

  it('sem o param devolve tudo', async () => {
    const { body } = await listar();
    expect(body.total).toBe(4);
  });

  it('status_pagamento=FIADO devolve só os fiados', async () => {
    const { body } = await listar('?status_pagamento=FIADO');
    expect(body.total).toBe(2);
    expect(body.data.every((m) => m.status_pagamento === 'FIADO')).toBe(true);
    expect(body.data.map((m) => m.cliente_fiado).sort()).toEqual(['João Souza', 'Maria Silva']);
  });

  it('status_pagamento=PAGO devolve as pagas, incluindo a ENTRADA', async () => {
    const { body } = await listar('?status_pagamento=PAGO');
    expect(body.total).toBe(2);
    expect(body.data.every((m) => m.status_pagamento === 'PAGO')).toBe(true);
  });

  it('o total do envelope reflete o filtro, não a lista inteira', async () => {
    // É o que quebra a paginação se o filtro for feito no frontend: o rodapé
    // continuaria dizendo "4 registros" com 2 linhas na tela.
    const { body } = await listar('?status_pagamento=FIADO&pageSize=1');
    expect(body.total).toBe(2);
    expect(body.pages).toBe(2);
    expect(body.data).toHaveLength(1);
  });

  it('valor inválido é ignorado em silêncio (não derruba a listagem com 400)', async () => {
    const res = await listar('?status_pagamento=TALVEZ');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
  });

  it('aceita minúsculas', async () => {
    const { body } = await listar('?status_pagamento=fiado');
    expect(body.total).toBe(2);
  });

  it('combina com a busca por texto em vez de substituí-la', async () => {
    const { body } = await listar('?status_pagamento=FIADO&q=BM-60');
    expect(body.total).toBe(2);
    const nada = await listar('?status_pagamento=FIADO&q=inexistente');
    expect(nada.body.total).toBe(0);
  });
});
