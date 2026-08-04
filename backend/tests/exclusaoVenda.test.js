// Fase A — exclusão de venda sem janela de tempo, nas duas linhas, e os três
// bugs de estoque que a exclusão irrestrita expõe.
//
// Enquanto o Som só apagava pedidos do mesmo dia, os três defeitos abaixo eram
// quase inalcançáveis. Liberar a exclusão a qualquer momento os coloca no
// caminho normal do usuário, então cada um tem teste próprio aqui.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

let marcaId;
let batId;   // produto de baterias
let somId;   // produto de som

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.garantias.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.estoque_som.deleteMany();

  const marca = await prisma.marca.upsert({
    where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' },
  });
  marcaId = marca.id;

  batId = (await prisma.estoque.create({
    data: {
      produto: 'Bateria Excl', modelo: 'BE-60', marca_id: marcaId,
      custo: '100.00', valor_venda: '200.00', qtd_minima: 1,
      qtd_inicial: 20, entradas: 0, saidas: 0,
    },
  })).id;

  somId = (await prisma.estoque_som.create({
    data: {
      produto: 'Som Excl', modelo: 'SE-1', marca_id: marcaId,
      custo: '100.00', valor_venda: '200.00', qtd_minima: 1,
      qtd_inicial: 20, entradas: 0, saidas: 0,
    },
  })).id;
});

const criarMovBat = (body) =>
  request(app).post('/api/movimentacoes').set(authAdmin()).send(body);
const criarMovSom = (body) =>
  request(app).post('/api/movimentacoes-som').set(authAdmin()).send(body);
const criarPedido = (itens, extra = {}) =>
  request(app).post('/api/pedido-som').set(authAdmin()).send({ veiculo: 'Teste', itens, ...extra });

/* ------------------------------------------------------------------ */

describe('Som: exclusão de pedido SEM janela de tempo', () => {
  it('pedido de dia ANTERIOR agora pode ser excluído (antes: 403)', async () => {
    const res = await criarPedido([
      { tipo: 'PRODUTO', produto_id: somId, quantidade: 3, valor_unit: 200 },
    ]);
    const pedidoId = res.body.data.id;

    // Envelhece o pedido: 45 dias atrás. Antes da Fase A isto dava 403.
    const antigo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    await prisma.pedido_som.update({ where: { id: pedidoId }, data: { created_at: antigo } });

    const del = await request(app).delete(`/api/pedido-som/${pedidoId}`).set(authAdmin());
    expect(del.status).toBe(204);

    const p = await prisma.estoque_som.findUnique({ where: { id: somId } });
    expect(p.saidas).toBe(0); // baixa revertida
    expect(await prisma.pedido_som.count()).toBe(0);
    expect(await prisma.pedido_som_item.count()).toBe(0);
    expect(await prisma.movimentacoes_som.count()).toBe(0);
  });

  it('pedido com o MESMO produto em dois itens estorna as duas quantidades', async () => {
    // O estorno lê o produto de novo a cada item dentro da transação; se lesse
    // uma vez só, o segundo item passaria batido ou falharia à toa.
    const res = await criarPedido([
      { tipo: 'PRODUTO', produto_id: somId, quantidade: 2, valor_unit: 200 },
      { tipo: 'PRODUTO', produto_id: somId, quantidade: 3, valor_unit: 200 },
    ]);
    expect((await prisma.estoque_som.findUnique({ where: { id: somId } })).saidas).toBe(5);

    const del = await request(app).delete(`/api/pedido-som/${res.body.data.id}`).set(authAdmin());
    expect(del.status).toBe(204);
    expect((await prisma.estoque_som.findUnique({ where: { id: somId } })).saidas).toBe(0);
  });
});

describe('Baterias: exclusão de venda exposta na UI', () => {
  it('excluir venda devolve o estoque e some do faturamento', async () => {
    const mov = (await criarMovBat({
      produto_id: batId, tipo: 'saida', quantidade: 4, valor_final: 200,
      forma_pagamento: 'pix',
    })).body;

    const antes = await request(app).get('/api/movimentacoes/resumo').set(authAdmin());
    expect(antes.body.data.vendasBrutas).toBe(800);

    const del = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(204);

    const p = await prisma.estoque.findUnique({ where: { id: batId } });
    expect(p.saidas).toBe(0);

    const depois = await request(app).get('/api/movimentacoes/resumo').set(authAdmin());
    expect(depois.body.data.vendasBrutas).toBe(0);
    expect(depois.body.data.qtdVendas).toBe(0);
    expect(depois.body.data.taxas).toBe(0);
  });

  it('exclusão some também do /vendas-resumo (as duas linhas)', async () => {
    const mov = (await criarMovBat({
      produto_id: batId, tipo: 'saida', quantidade: 2, valor_final: 200, forma_pagamento: 'pix',
    })).body;
    const ped = await criarPedido(
      [{ tipo: 'PRODUTO', produto_id: somId, quantidade: 1, valor_unit: 300 }],
      { forma_pagamento: 'Dinheiro' },
    );

    const antes = await request(app).get('/api/vendas-resumo').set(authAdmin());
    expect(antes.body.data.total.vendasBrutas).toBe(700); // 400 + 300

    await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    await request(app).delete(`/api/pedido-som/${ped.body.data.id}`).set(authAdmin());

    const depois = await request(app).get('/api/vendas-resumo').set(authAdmin());
    expect(depois.body.data.total.vendasBrutas).toBe(0);
    expect(depois.body.data.baterias.vendasBrutas).toBe(0);
    expect(depois.body.data.som.vendasBrutas).toBe(0);
    expect(depois.body.data.som.qtdPedidos).toBe(0);
  });

  it('id inexistente → 404 (antes respondia 204 silenciosamente)', async () => {
    const del = await request(app).delete('/api/movimentacoes/999999').set(authAdmin());
    expect(del.status).toBe(404);
  });
});

/* ------------------- BUG 1: falhar em vez de clampar ------------------- */

describe('BUG 1 — estorno que não cabe FALHA, não trunca em zero', () => {
  it('baterias: saidas menor que a quantidade da movimentação → 409 e nada muda', async () => {
    const mov = (await criarMovBat({
      produto_id: batId, tipo: 'saida', quantidade: 5, valor_final: 200,
    })).body;
    expect((await prisma.estoque.findUnique({ where: { id: batId } })).saidas).toBe(5);

    // Simula a inconsistência que o clamp mascarava: o agregado já não reflete
    // a movimentação (ex.: mexida manual no banco, ou reversão dupla anterior).
    await prisma.estoque.update({ where: { id: batId }, data: { saidas: 2 } });

    const del = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(409);
    expect(del.body.message).toMatch(/inconsistente/i);

    // ROLLBACK: nem o estoque foi tocado, nem a movimentação apagada.
    expect((await prisma.estoque.findUnique({ where: { id: batId } })).saidas).toBe(2);
    expect(await prisma.movimentacoes.count()).toBe(1);
  });

  it('som avulsa: mesma proteção → 409 e nada muda', async () => {
    const mov = (await criarMovSom({ produto_id: somId, tipo: 'saida', quantidade: 5 })).body;
    await prisma.estoque_som.update({ where: { id: somId }, data: { saidas: 1 } });

    const del = await request(app).delete(`/api/movimentacoes-som/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(409);
    expect((await prisma.estoque_som.findUnique({ where: { id: somId } })).saidas).toBe(1);
    expect(await prisma.movimentacoes_som.count()).toBe(1);
  });

  it('pedido de som: estorno que não cabe → 409, pedido e itens PRESERVADOS', async () => {
    const res = await criarPedido([
      { tipo: 'PRODUTO', produto_id: somId, quantidade: 6, valor_unit: 200 },
    ]);
    const pedidoId = res.body.data.id;
    await prisma.estoque_som.update({ where: { id: somId }, data: { saidas: 2 } });

    const del = await request(app).delete(`/api/pedido-som/${pedidoId}`).set(authAdmin());
    expect(del.status).toBe(409);

    // A transação inteira volta atrás: pedido, itens e movimentações intactos.
    expect(await prisma.pedido_som.count()).toBe(1);
    expect(await prisma.pedido_som_item.count()).toBe(1);
    expect(await prisma.movimentacoes_som.count()).toBe(1);
    expect((await prisma.estoque_som.findUnique({ where: { id: somId } })).saidas).toBe(2);
  });

  it('limite exato (saidas == quantidade) continua excluindo', async () => {
    const mov = (await criarMovBat({
      produto_id: batId, tipo: 'saida', quantidade: 7, valor_final: 200,
    })).body;
    const del = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(204);
    expect((await prisma.estoque.findUnique({ where: { id: batId } })).saidas).toBe(0);
  });

  it('ENTRADA também é protegida (agregado entradas)', async () => {
    const mov = (await criarMovBat({ produto_id: batId, tipo: 'entrada', quantidade: 5 })).body;
    await prisma.estoque.update({ where: { id: batId }, data: { entradas: 1 } });

    const del = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(409);
    expect((await prisma.estoque.findUnique({ where: { id: batId } })).entradas).toBe(1);
  });
});

/* -------------- BUG 2: dupla reversão via movimentação de pedido -------------- */

describe('BUG 2 — movimentação de pedido não se apaga avulsa', () => {
  it('movimentação com motivo "Pedido Som #N" → 409 e estoque intacto', async () => {
    const res = await criarPedido([
      { tipo: 'PRODUTO', produto_id: somId, quantidade: 3, valor_unit: 200 },
    ]);
    const pedidoId = res.body.data.id;

    const mov = await prisma.movimentacoes_som.findFirst();
    expect(mov.motivo).toBe(`Pedido Som #${pedidoId}`);

    const del = await request(app).delete(`/api/movimentacoes-som/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(409);
    expect(del.body.message).toMatch(/pedido/i);

    // Sem o guard, aqui saidas cairia para 0 e o pedido seguiria apontando a
    // baixa — excluir o pedido depois estornaria DE NOVO (estoque inflado).
    expect((await prisma.estoque_som.findUnique({ where: { id: somId } })).saidas).toBe(3);
    expect(await prisma.movimentacoes_som.count()).toBe(1);
  });

  it('o caminho certo (excluir o pedido) estorna exatamente uma vez', async () => {
    const res = await criarPedido([
      { tipo: 'PRODUTO', produto_id: somId, quantidade: 3, valor_unit: 200 },
    ]);
    const del = await request(app).delete(`/api/pedido-som/${res.body.data.id}`).set(authAdmin());
    expect(del.status).toBe(204);
    expect((await prisma.estoque_som.findUnique({ where: { id: somId } })).saidas).toBe(0);
  });

  it('movimentação MANUAL (motivo null) continua podendo ser excluída', async () => {
    const mov = (await criarMovSom({ produto_id: somId, tipo: 'saida', quantidade: 2 })).body;
    expect(mov.motivo ?? null).toBeNull();

    const del = await request(app).delete(`/api/movimentacoes-som/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(204);
    expect((await prisma.estoque_som.findUnique({ where: { id: somId } })).saidas).toBe(0);
  });
});

/* -------------- BUG 3: empréstimo de garantia não é venda -------------- */

describe('BUG 3 — movimentação de empréstimo de garantia não se apaga por aqui', () => {
  it('movimentação com garantia_id → 409 e nada muda', async () => {
    const garantia = await prisma.garantias.create({
      data: {
        cliente_nome: 'Cliente Teste', cliente_documento: '000',
        cliente_telefone: '000', cliente_endereco: 'Rua Teste',
        produto_codigo: 'BE-60', produto_descricao: 'Bateria Excl',
        estoque_id: batId, status: 'EM_LOJA',
        emprestimo_produto_id: batId, emprestimo_quantidade: 1,
      },
    });
    // Empréstimo: SAÍDA vinculada à garantia (valor 0, não é venda).
    const mov = await prisma.movimentacoes.create({
      data: {
        produto_id: batId, garantia_id: garantia.id, tipo: 'SAIDA',
        quantidade: 1, valor_final: '0.00', data_movimentacao: new Date(),
      },
    });
    await prisma.estoque.update({ where: { id: batId }, data: { saidas: 1 } });

    const del = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(409);
    expect(del.body.message).toMatch(/empréstimo/i);

    expect(await prisma.movimentacoes.count()).toBe(1);
    expect((await prisma.estoque.findUnique({ where: { id: batId } })).saidas).toBe(1);
  });

  it('venda normal (garantia_id null) do mesmo produto continua excluível', async () => {
    const mov = (await criarMovBat({
      produto_id: batId, tipo: 'saida', quantidade: 2, valor_final: 200,
    })).body;
    const del = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(204);
  });
});
