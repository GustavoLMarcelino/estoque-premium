import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';
import { congelarLeituras } from './helpers/leituraDesatualizada.js';

// Baixa e entrada de estoque sob CONCORRÊNCIA. Antes, cada rota lia `saidas`,
// somava e gravava o total (e checava o saldo com essa mesma leitura): dois
// lançamentos simultâneos do último item passavam os dois, e um dos incrementos
// se perdia. Agora o agregado é gravado com increment atômico e o saldo é
// conferido na linha DEVOLVIDA pelo update — o perdedor leva 409 e a transação
// desfaz tudo.
//
// ATENÇÃO: o SQLite serializa as transações, então os testes com Promise.all
// passam até com o código antigo (ver helpers/leituraDesatualizada.js). A prova
// de que o conserto vale está no bloco "leitura desatualizada", que reproduz o
// que o MySQL faz e FALHA no código antigo.

const saldoBaterias = async (id) => {
  const p = await prisma.estoque.findUnique({ where: { id } });
  return p.qtd_inicial + (p.entradas ?? 0) - (p.saidas ?? 0);
};
const saldoSom = async (id) => {
  const p = await prisma.estoque_som.findUnique({ where: { id } });
  return p.qtd_inicial + (p.entradas ?? 0) - (p.saidas ?? 0);
};
const statusOrdenados = (resps) => resps.map((r) => r.status).sort((a, b) => a - b);

const clienteGarantia = { nome: 'João', telefone: '(47) 90000-0000', endereco: 'Rua A, 100' };
const emprestar = (produto_id, quantidade = 1) => request(app).post('/api/garantias').set(authAdmin()).send({
  cliente: clienteGarantia,
  produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' },
  emprestimo: { ativo: true, produto_id, quantidade },
});
const venda = (produto_id, quantidade = 1) => request(app).post('/api/movimentacoes').set(authAdmin())
  .send({ produto_id, tipo: 'saida', quantidade, valor_final: 150 });
const pedidoDeProduto = (produto_id, quantidade = 1) => request(app).post('/api/pedido-som').set(authAdmin()).send({
  forma_pagamento: 'pix',
  itens: [{ tipo: 'PRODUTO', produto_id, quantidade, valor_unit: 150 }],
});

let marcaId;
let bateriaId; // saldo 1
let somId; // saldo 1

beforeEach(async () => {
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.garantias.deleteMany();
  await prisma.estoque.deleteMany();
  marcaId = (await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } })).id;
  const base = { marca_id: marcaId, custo: '100.00', valor_venda: '150.00', qtd_minima: 1, qtd_inicial: 1, entradas: 0, saidas: 0 };
  bateriaId = (await prisma.estoque.create({ data: { ...base, produto: 'Bateria 60Ah', modelo: 'BAT-60' } })).id;
  somId = (await prisma.estoque_som.create({ data: { ...base, produto: 'Alto-falante', modelo: 'AF-6' } })).id;
});

describe('último item em estoque, dois lançamentos ao mesmo tempo', () => {
  it('Baterias: duas saídas de 1 un. → uma 201 e uma 409; saldo 0; uma movimentação', async () => {
    const resps = await Promise.all([venda(bateriaId), venda(bateriaId)]);

    expect(statusOrdenados(resps)).toEqual([201, 409]);
    expect(resps.find((r) => r.status === 409).body.message).toMatch(/excede/i);
    expect(await saldoBaterias(bateriaId)).toBe(0);
    expect(await prisma.movimentacoes.count()).toBe(1);
  });

  it('Som (saída avulsa): duas saídas de 1 un. → uma 201 e uma 409; saldo 0; uma movimentação', async () => {
    const saida = () => request(app).post('/api/movimentacoes-som').set(authAdmin())
      .send({ produto_id: somId, tipo: 'saida', quantidade: 1 });
    const resps = await Promise.all([saida(), saida()]);

    expect(statusOrdenados(resps)).toEqual([201, 409]);
    expect(await saldoSom(somId)).toBe(0);
    expect(await prisma.movimentacoes_som.count()).toBe(1);
  });

  it('Pedido de Som: dois pedidos com o último item → um 201 e um 409; saldo 0; um pedido', async () => {
    const resps = await Promise.all([pedidoDeProduto(somId), pedidoDeProduto(somId)]);

    expect(statusOrdenados(resps)).toEqual([201, 409]);
    expect(resps.find((r) => r.status === 409).body.message).toMatch(/estoque insuficiente/i);
    expect(await saldoSom(somId)).toBe(0);
    expect(await prisma.pedido_som.count()).toBe(1);
    expect(await prisma.movimentacoes_som.count()).toBe(1);
  });

  it('Empréstimo de garantia: dois empréstimos do último item → um 201 e um 400; saldo 0', async () => {
    const resps = await Promise.all([emprestar(bateriaId), emprestar(bateriaId)]);

    expect(statusOrdenados(resps)).toEqual([201, 400]);
    expect(resps.find((r) => r.status === 400).body.message).toMatch(/sem estoque suficiente/i);
    expect(await saldoBaterias(bateriaId)).toBe(0);
    expect(await prisma.movimentacoes.count()).toBe(1);
  });
});

describe('lançamentos simultâneos não perdem incremento', () => {
  it('5 entradas de 1 un. ao mesmo tempo → entradas = 5 (Baterias e Som)', async () => {
    const entrada = (rota, produto_id) => request(app).post(rota).set(authAdmin())
      .send({ produto_id, tipo: 'entrada', quantidade: 1 });
    const resps = await Promise.all([
      ...Array.from({ length: 5 }, () => entrada('/api/movimentacoes', bateriaId)),
      ...Array.from({ length: 5 }, () => entrada('/api/movimentacoes-som', somId)),
    ]);

    expect(resps.every((r) => r.status === 201)).toBe(true);
    expect((await prisma.estoque.findUnique({ where: { id: bateriaId } })).entradas).toBe(5);
    expect((await prisma.estoque_som.findUnique({ where: { id: somId } })).entradas).toBe(5);
  });

  it('3 saídas de 1 un. de um produto com saldo 5, ao mesmo tempo → saidas = 3', async () => {
    await prisma.estoque.update({ where: { id: bateriaId }, data: { qtd_inicial: 5 } });
    const resps = await Promise.all([venda(bateriaId), venda(bateriaId), venda(bateriaId)]);

    expect(resps.every((r) => r.status === 201)).toBe(true);
    expect((await prisma.estoque.findUnique({ where: { id: bateriaId } })).saidas).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// O MySQL lê um snapshot no começo da transação; o UPDATE vê o valor mais novo.
// Estes testes servem à rota uma leitura do produto de ANTES de outro lançamento
// ter sido gravado — a mesma coisa, só que determinística.
// ---------------------------------------------------------------------------
describe('leitura desatualizada (simula o snapshot do MySQL)', () => {
  let restaurar;
  afterEach(() => restaurar?.());

  it('Baterias: a segunda saída do último item leva 409 mesmo lendo saldo 1', async () => {
    restaurar = await congelarLeituras(prisma); // saldo 1
    expect((await venda(bateriaId)).status).toBe(201); // grava saidas=1
    const segunda = await venda(bateriaId); // a leitura ainda diz saldo 1

    expect(segunda.status).toBe(409);
    expect(await saldoBaterias(bateriaId)).toBe(0);
    expect(await prisma.movimentacoes.count()).toBe(1);
  });

  it('Baterias: saída com leitura desatualizada não perde o incremento (saldo 5, duas saídas → saidas = 2)', async () => {
    await prisma.estoque.update({ where: { id: bateriaId }, data: { qtd_inicial: 5 } });
    restaurar = await congelarLeituras(prisma); // saidas = 0
    await venda(bateriaId);
    await venda(bateriaId); // soma em JS partiria de saidas=0 e gravaria 1 de novo

    expect((await prisma.estoque.findUnique({ where: { id: bateriaId } })).saidas).toBe(2);
  });

  it('Baterias: entrada com leitura desatualizada não perde o incremento', async () => {
    restaurar = await congelarLeituras(prisma); // entradas = 0
    const entrada = () => request(app).post('/api/movimentacoes').set(authAdmin())
      .send({ produto_id: bateriaId, tipo: 'entrada', quantidade: 1 });
    await entrada();
    await entrada();

    expect((await prisma.estoque.findUnique({ where: { id: bateriaId } })).entradas).toBe(2);
  });

  it('Som (saída avulsa): a segunda saída do último item leva 409', async () => {
    restaurar = await congelarLeituras(prisma);
    const saida = () => request(app).post('/api/movimentacoes-som').set(authAdmin())
      .send({ produto_id: somId, tipo: 'saida', quantidade: 1 });
    expect((await saida()).status).toBe(201);
    const segunda = await saida();

    expect(segunda.status).toBe(409);
    expect(await saldoSom(somId)).toBe(0);
    expect(await prisma.movimentacoes_som.count()).toBe(1);
  });

  it('Som: entrada com leitura desatualizada não perde o incremento', async () => {
    restaurar = await congelarLeituras(prisma);
    const entrada = () => request(app).post('/api/movimentacoes-som').set(authAdmin())
      .send({ produto_id: somId, tipo: 'entrada', quantidade: 1 });
    await entrada();
    await entrada();

    expect((await prisma.estoque_som.findUnique({ where: { id: somId } })).entradas).toBe(2);
  });

  it('Pedido de Som: o segundo pedido do último item leva 409 e não deixa pedido nem movimentação', async () => {
    restaurar = await congelarLeituras(prisma);
    expect((await pedidoDeProduto(somId)).status).toBe(201);
    const segundo = await pedidoDeProduto(somId);

    expect(segundo.status).toBe(409);
    expect(segundo.body.message).toMatch(/estoque insuficiente/i);
    expect(await saldoSom(somId)).toBe(0);
    expect(await prisma.pedido_som.count()).toBe(1);
    expect(await prisma.movimentacoes_som.count()).toBe(1);
  });

  it('Empréstimo de garantia: o segundo empréstimo do último item leva 400', async () => {
    restaurar = await congelarLeituras(prisma);
    expect((await emprestar(bateriaId)).status).toBe(201);
    const segundo = await emprestar(bateriaId);

    expect(segundo.status).toBe(400);
    expect(await saldoBaterias(bateriaId)).toBe(0);
    expect(await prisma.movimentacoes.count()).toBe(1);
  });

  it('Devolução de empréstimo com leitura desatualizada não perde a reversão', async () => {
    await prisma.estoque.update({ where: { id: bateriaId }, data: { qtd_inicial: 5 } });
    const g1 = (await emprestar(bateriaId, 2)).body;
    const g2 = (await emprestar(bateriaId, 2)).body; // saidas = 4
    restaurar = await congelarLeituras(prisma); // saidas = 4
    await request(app).patch(`/api/garantias/${g1.id}/devolver`).set(authAdmin());
    await request(app).patch(`/api/garantias/${g2.id}/devolver`).set(authAdmin());

    expect((await prisma.estoque.findUnique({ where: { id: bateriaId } })).saidas).toBe(0);
  });

  it('PUT de venda: aumentar a quantidade além do saldo real leva 409 e não altera nada', async () => {
    // saldo 3. A: 1 un. (saldo 2). Snapshot com saldo 2; depois B: 2 un. (saldo 0).
    await prisma.estoque.update({ where: { id: bateriaId }, data: { qtd_inicial: 3 } });
    const a = (await venda(bateriaId, 1)).body;
    restaurar = await congelarLeituras(prisma); // leitura diz saldo 2
    expect((await venda(bateriaId, 2)).status).toBe(201); // saldo real 0

    // Real: estornar A (+1) → saldo 1; pedir 2 não cabe. A leitura velha diz 2.
    const res = await request(app).put(`/api/movimentacoes/${a.id}`).set(authAdmin())
      .send({ quantidade: 2, valor_final: 150 });

    expect(res.status).toBe(409);
    expect(await saldoBaterias(bateriaId)).toBe(0);
    expect((await prisma.movimentacoes.findUnique({ where: { id: a.id } })).quantidade).toBe(1);
  });

  it('PUT de pedido de Som (produtos): quantidade além do saldo real leva 409 e preserva o pedido', async () => {
    await prisma.estoque_som.update({ where: { id: somId }, data: { qtd_inicial: 3 } });
    const criado = (await pedidoDeProduto(somId, 1)).body.data;
    restaurar = await congelarLeituras(prisma); // saldo 2
    await request(app).post('/api/movimentacoes-som').set(authAdmin())
      .send({ produto_id: somId, tipo: 'saida', quantidade: 2 }); // saldo real 0

    const res = await request(app).put(`/api/pedido-som/${criado.id}`).set(authAdmin())
      .send({ itens_produto: [{ produto_id: somId, quantidade: 2, valor_unit: 150 }] });

    expect(res.status).toBe(409);
    expect(await saldoSom(somId)).toBe(0);
    const itens = await prisma.pedido_som_item.findMany({ where: { pedido_id: criado.id } });
    expect(itens.map((i) => i.quantidade)).toEqual([1]);
  });
});

// O increment (SET col = col + n) deixa NULL como NULL. Por isso produto novo
// TEM que nascer com entradas/saidas = 0, mesmo que o corpo mande null.
describe.each([
  ['Baterias', '/api/estoque', 'estoque', '/api/movimentacoes'],
  ['Som', '/api/estoque-som', 'estoque_som', '/api/movimentacoes-som'],
])('cadastro de produto — %s', (_nome, rotaEstoque, delegate, rotaMov) => {
  it('nasce com entradas e saidas = 0 (nunca null) e a primeira entrada soma certo', async () => {
    const criado = await request(app).post(rotaEstoque).set(authAdmin()).send({
      produto: 'Produto Novo', modelo: 'PN-1', marca_id: marcaId, custo: 100, valor_venda: 150,
      qtd_inicial: 2, entradas: null, saidas: null,
    });
    expect(criado.status).toBe(201);
    const linha = await prisma[delegate].findUnique({ where: { id: criado.body.id } });
    expect(linha.entradas).toBe(0);
    expect(linha.saidas).toBe(0);

    const entrada = await request(app).post(rotaMov).set(authAdmin())
      .send({ produto_id: criado.body.id, tipo: 'entrada', quantidade: 3, valor_final: 150 });
    expect(entrada.status).toBe(201);
    expect((await prisma[delegate].findUnique({ where: { id: criado.body.id } })).entradas).toBe(3);
  });
});
