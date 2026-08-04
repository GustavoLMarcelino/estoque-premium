// Fase D — editar produto/quantidade de itens de pedido de Som.
//
// É a única rota de edição que MEXE EM ESTOQUE. Estorna as baixas atuais e
// reaplica a lista nova, tudo numa transação — porque movimentacoes_som só se
// liga ao pedido por motivo='Pedido Som #N', sem vínculo com o item: "desfazer
// a movimentação daquele item" não existe no banco.
//
// Os testes cobrem as três coisas que isso exige:
//   • a ORDEM certa — o estorno vem antes da validação, senão aumentar a
//     quantidade de um item num produto zerado daria 409 indevido (#9);
//   • rollback COMPLETO quando falha no meio, com estoque já mexido (#8);
//   • nada de reprecificar: valor_unit vem do payload, sempre (#12).
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

let prodA;
let prodB;

async function criarProduto(nome, qtdInicial = 10) {
  const marca = await prisma.marca.upsert({
    where: { nome: 'Pioneer' }, update: {}, create: { nome: 'Pioneer' },
  });
  return prisma.estoque_som.create({
    data: {
      produto: nome, modelo: 'M1', marca_id: marca.id,
      custo: '100.00', valor_venda: '300.00', valor_vista: '300.00',
      valor_parcelado: '330.00', qtd_minima: 1,
      qtd_inicial: qtdInicial, entradas: 0, saidas: 0,
    },
  });
}

beforeEach(async () => {
  await prisma.venda_auditoria.deleteMany();
  await prisma.comissao_periodo_item.deleteMany();
  await prisma.comissao_periodo.deleteMany();
  await prisma.conferencia_item.deleteMany();
  await prisma.conferencia_estoque.deleteMany();
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.classe_som.deleteMany();

  prodA = await criarProduto('Multimidia A', 10);
  prodB = await criarProduto('Falante B', 10);
});

/** Pedido com 2 un. do produto A (baixa estoque) + 1 serviço de 400. */
async function criarPedido(itensProduto = [{ produto_id: () => prodA.id, quantidade: 2, valor_unit: 300 }]) {
  const res = await request(app).post('/api/pedido-som').set(authAdmin()).send({
    veiculo: 'Gol 2015',
    forma_pagamento: 'PIX',
    itens: [
      ...itensProduto.map((i) => ({
        tipo: 'PRODUTO', produto_id: i.produto_id(), descricao: '',
        quantidade: i.quantidade, valor_unit: i.valor_unit,
      })),
      { tipo: 'MAO_OBRA', descricao: 'Instalacao', quantidade: 1, valor_unit: 400 },
    ],
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

const editar = (id, body) =>
  request(app).put(`/api/pedido-som/${id}`).set(authAdmin()).send(body);

const pedidoDo = (id) => prisma.pedido_som.findUnique({ where: { id }, include: { itens: true } });
const saidasDe = async (id) => (await prisma.estoque_som.findUnique({ where: { id } })).saidas;
const movsDo = (id) => prisma.movimentacoes_som.findMany({ where: { motivo: `Pedido Som #${id}` }, orderBy: { id: 'asc' } });
const n = (v) => Number(v ?? 0);

async function conferirInvariante(pedidoId) {
  const p = await pedidoDo(pedidoId);
  const maoObra = p.itens.reduce((acc, it) => acc + n(it.mao_obra_total), 0);
  const produtos = p.itens.filter((it) => it.tipo === 'PRODUTO').reduce((acc, it) => acc + n(it.valor_total), 0);
  expect(n(p.valor_mao_obra)).toBeCloseTo(maoObra, 2);
  expect(n(p.valor_total)).toBeCloseTo(produtos + maoObra, 2);
  return p;
}

/* ─────────────────── 1–6: as operações básicas ─────────────────── */

describe('Quantidade, troca, adicionar e remover', () => {
  it('1) só quantidade: 2 → 3 sobe saidas em 1', async () => {
    const p = await criarPedido();
    expect(await saidasDe(prodA.id)).toBe(2);

    const item = (await pedidoDo(p.id)).itens.find((i) => i.tipo === 'PRODUTO');
    const res = await editar(p.id, {
      itens_produto: [{ item_id: item.id, produto_id: prodA.id, quantidade: 3, valor_unit: 300 }],
    });
    expect(res.status).toBe(200);
    expect(await saidasDe(prodA.id)).toBe(3);
    expect(n((await conferirInvariante(p.id)).valor_total)).toBe(1300); // 3×300 + 400
  });

  it('2) só quantidade: 2 → 1 desce saidas', async () => {
    const p = await criarPedido();

    await editar(p.id, {
      itens_produto: [{ produto_id: prodA.id, quantidade: 1, valor_unit: 300 }],
    });
    expect(await saidasDe(prodA.id)).toBe(1);
  });

  it('3) TROCAR de produto: A volta inteiro, B baixa a nova quantidade', async () => {
    const p = await criarPedido();
    expect(await saidasDe(prodA.id)).toBe(2);
    expect(await saidasDe(prodB.id)).toBe(0);

    await editar(p.id, {
      itens_produto: [{ produto_id: prodB.id, quantidade: 4, valor_unit: 250 }],
    });

    expect(await saidasDe(prodA.id)).toBe(0); // estornado inteiro
    expect(await saidasDe(prodB.id)).toBe(4);
    const depois = await conferirInvariante(p.id);
    expect(depois.itens.filter((i) => i.tipo === 'PRODUTO')).toHaveLength(1);
    expect(n(depois.valor_total)).toBe(1400); // 4×250 + 400
  });

  it('4) adicionar item de produto', async () => {
    const p = await criarPedido();

    await editar(p.id, {
      itens_produto: [
        { produto_id: prodA.id, quantidade: 2, valor_unit: 300 },
        { produto_id: prodB.id, quantidade: 1, valor_unit: 500 },
      ],
    });

    expect(await saidasDe(prodA.id)).toBe(2);
    expect(await saidasDe(prodB.id)).toBe(1);
    expect(n((await conferirInvariante(p.id)).valor_total)).toBe(1500); // 600 + 500 + 400
  });

  it('5) remover um item devolve o estoque dele', async () => {
    const p = await criarPedido([
      { produto_id: () => prodA.id, quantidade: 2, valor_unit: 300 },
      { produto_id: () => prodB.id, quantidade: 3, valor_unit: 200 },
    ]);
    expect(await saidasDe(prodB.id)).toBe(3);

    await editar(p.id, {
      itens_produto: [{ produto_id: prodA.id, quantidade: 2, valor_unit: 300 }],
    });

    expect(await saidasDe(prodA.id)).toBe(2);
    expect(await saidasDe(prodB.id)).toBe(0);
  });

  it('6) lista vazia remove todos os produtos e devolve o estoque', async () => {
    const p = await criarPedido();

    const res = await editar(p.id, { itens_produto: [] });
    expect(res.status).toBe(200);

    expect(await saidasDe(prodA.id)).toBe(0);
    expect(await movsDo(p.id)).toHaveLength(0);
    const depois = await conferirInvariante(p.id);
    expect(depois.itens.filter((i) => i.tipo === 'PRODUTO')).toHaveLength(0);
    expect(n(depois.valor_total)).toBe(400); // só a mão de obra
  });
});

/* ─────────────── 7–9: estoque insuficiente e a ORDEM ─────────────── */

describe('Validação de estoque e a ordem estorno→validação', () => {
  it('7) estoque insuficiente → 409 e saidas EXATAMENTE como antes', async () => {
    const p = await criarPedido();
    const antes = await saidasDe(prodA.id);

    const res = await editar(p.id, {
      itens_produto: [{ produto_id: prodA.id, quantidade: 99, valor_unit: 300 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Estoque insuficiente/);

    expect(await saidasDe(prodA.id)).toBe(antes); // o estorno já aplicado voltou
    expect(await movsDo(p.id)).toHaveLength(1);
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });

  // ⭐ A prova da ordem: o produto está com em_estoque 0 porque ESTE pedido
  // levou tudo. Subir de 2 para 3 tem que funcionar — as 2 voltam no estorno
  // antes de a validação rodar. Validar antes daria 409 indevido.
  it('9) sobe a quantidade num produto com em_estoque 0 (as un. do próprio pedido voltam antes)', async () => {
    const prodC = await criarProduto('Esgotado C', 2);
    const p = await criarPedido([{ produto_id: () => prodC.id, quantidade: 2, valor_unit: 300 }]);

    const zerado = await prisma.estoque_som.findUnique({ where: { id: prodC.id } });
    const emEstoque = Number(zerado.qtd_inicial) + Number(zerado.entradas) - Number(zerado.saidas);
    expect(emEstoque).toBe(0); // não há uma unidade sequer livre

    const res = await editar(p.id, {
      itens_produto: [{ produto_id: prodC.id, quantidade: 2, valor_unit: 300 }],
    });
    expect(res.status).toBe(200);
    expect(await saidasDe(prodC.id)).toBe(2);

    // e 3 realmente não cabe (só existem 2 no mundo)
    const demais = await editar(p.id, {
      itens_produto: [{ produto_id: prodC.id, quantidade: 3, valor_unit: 300 }],
    });
    expect(demais.status).toBe(409);
    expect(await saidasDe(prodC.id)).toBe(2);
  });

  it('25) estoque já inconsistente → 409 do estorno, nada alterado', async () => {
    const p = await criarPedido();
    // Alguém zerou saidas por fora: o estorno de 2 não cabe mais.
    await prisma.estoque_som.update({ where: { id: prodA.id }, data: { saidas: 0 } });

    const res = await editar(p.id, {
      itens_produto: [{ produto_id: prodA.id, quantidade: 1, valor_unit: 300 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/inconsistente/i);
    expect(await saidasDe(prodA.id)).toBe(0);
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });
});

/* ─────────────────── 8: rollback total ─────────────────── */

describe('Rollback', () => {
  // ⭐ O erro acontece DEPOIS de o estorno já ter escrito no banco e de as
  // movimentações antigas já terem sido apagadas. Tudo tem que voltar.
  it('8) ROLLBACK TOTAL: falha no meio → estoque, itens, movimentações e diário intactos', async () => {
    const p = await criarPedido();
    const antes = {
      saidas: await saidasDe(prodA.id),
      pedido: JSON.stringify(await pedidoDo(p.id)),
      movs: JSON.stringify(await movsDo(p.id)),
    };

    // 1º item válido, 2º com produto inexistente: o estorno e o deleteMany já
    // rodaram quando o 404 estoura.
    const res = await editar(p.id, {
      itens_produto: [
        { produto_id: prodA.id, quantidade: 1, valor_unit: 300 },
        { produto_id: 999999, quantidade: 1, valor_unit: 300 },
      ],
    });
    expect(res.status).toBe(404);

    expect(await saidasDe(prodA.id)).toBe(antes.saidas);
    expect(JSON.stringify(await pedidoDo(p.id))).toBe(antes.pedido);
    expect(JSON.stringify(await movsDo(p.id))).toBe(antes.movs);
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });
});

/* ─────────────── 10–15: preservação e coerência ─────────────── */

describe('O que não pode mudar', () => {
  it('10) serviços intocados quando só itens_produto vem no request', async () => {
    const p = await criarPedido();
    const servicosAntes = JSON.stringify(
      (await pedidoDo(p.id)).itens.filter((i) => i.tipo === 'MAO_OBRA'),
    );

    await editar(p.id, {
      itens_produto: [{ produto_id: prodA.id, quantidade: 5, valor_unit: 300 }],
    });

    const servicosDepois = JSON.stringify(
      (await pedidoDo(p.id)).itens.filter((i) => i.tipo === 'MAO_OBRA'),
    );
    expect(servicosDepois).toBe(servicosAntes);
  });

  it('11) invariante: cabeçalho = Σ itens', async () => {
    const p = await criarPedido();
    await editar(p.id, {
      itens_produto: [
        { produto_id: prodA.id, quantidade: 3, valor_unit: 333.33 },
        { produto_id: prodB.id, quantidade: 2, valor_unit: 16.67 },
      ],
    });
    const depois = await conferirInvariante(p.id);
    expect(n(depois.valor_total)).toBe(1433.33); // 999.99 + 33.34 + 400
  });

  // ⭐ Mudar a quantidade de um pedido de julho não pode reprecificá-lo pela
  // tabela de hoje. O preço vem do payload, sempre.
  it('12) NÃO reprecifica: mantém o valor_unit enviado mesmo com o produto mais caro', async () => {
    const p = await criarPedido();
    // O produto sobe de preço DEPOIS do pedido lançado.
    await prisma.estoque_som.update({
      where: { id: prodA.id },
      data: { valor_venda: '999.00', valor_vista: '999.00', valor_parcelado: '1099.00' },
    });

    await editar(p.id, {
      itens_produto: [{ produto_id: prodA.id, quantidade: 3, valor_unit: 300 }],
    });

    const item = (await pedidoDo(p.id)).itens.find((i) => i.tipo === 'PRODUTO');
    expect(n(item.valor_unit)).toBe(300);   // o preço da época
    expect(n(item.valor_total)).toBe(900);
  });

  it('13) uma movimentação por item, com motivo e valor corretos, sem órfã', async () => {
    const p = await criarPedido();

    await editar(p.id, {
      itens_produto: [
        { produto_id: prodA.id, quantidade: 2, valor_unit: 300 },
        { produto_id: prodB.id, quantidade: 1, valor_unit: 250 },
      ],
    });

    const movs = await movsDo(p.id);
    expect(movs).toHaveLength(2);
    expect(movs.map((m) => m.produto_id).sort()).toEqual([prodA.id, prodB.id].sort());
    expect(movs.every((m) => m.tipo === 'SAIDA')).toBe(true);
    expect(n(movs.find((m) => m.produto_id === prodB.id).valor_final)).toBe(250);
    // nenhuma movimentação de Som fora deste pedido
    expect(await prisma.movimentacoes_som.count()).toBe(2);
  });

  // ⭐ Recriar com now() faria uma venda de julho aparecer como saída de hoje.
  it('14) data_movimentacao recriada = created_at do pedido, não a de agora', async () => {
    const p = await criarPedido();
    const antiga = new Date('2026-02-10T12:00:00Z');
    await prisma.pedido_som.update({ where: { id: p.id }, data: { created_at: antiga } });

    await editar(p.id, {
      itens_produto: [{ produto_id: prodA.id, quantidade: 1, valor_unit: 300 }],
    });

    const [mov] = await movsDo(p.id);
    expect(new Date(mov.data_movimentacao).toISOString()).toBe(antiga.toISOString());
  });

  it('15) mesmo produto em dois itens: validação cumulativa e saidas somadas', async () => {
    const p = await criarPedido();

    const res = await editar(p.id, {
      itens_produto: [
        { produto_id: prodA.id, quantidade: 4, valor_unit: 300 },
        { produto_id: prodA.id, quantidade: 3, valor_unit: 280 },
      ],
    });
    expect(res.status).toBe(200);
    expect(await saidasDe(prodA.id)).toBe(7);

    // 10 no total: 6 + 5 não cabe, e o segundo item é quem estoura.
    const demais = await editar(p.id, {
      itens_produto: [
        { produto_id: prodA.id, quantidade: 6, valor_unit: 300 },
        { produto_id: prodA.id, quantidade: 5, valor_unit: 300 },
      ],
    });
    expect(demais.status).toBe(409);
    expect(await saidasDe(prodA.id)).toBe(7); // rollback
  });
});

/* ─────────────── 16–20: auditoria, C2, comissão, dashboard ─────────────── */

describe('Auditoria, convivência com a C2 e efeitos', () => {
  it('16) auditoria com cabeçalho, itens E movimentações anteriores', async () => {
    const p = await criarPedido();

    await editar(p.id, {
      itens_produto: [{ produto_id: prodB.id, quantidade: 1, valor_unit: 250 }],
    });

    const linhas = await prisma.venda_auditoria.findMany();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].acao).toBe('EDICAO');
    const snap = JSON.parse(linhas[0].conteudo_anterior);
    const itemAntigo = snap.itens.find((i) => i.tipo === 'PRODUTO');
    expect(itemAntigo.produto_id).toBe(prodA.id);
    expect(itemAntigo.quantidade).toBe(2);
    expect(snap.movimentacoes).toHaveLength(1);
    expect(snap.movimentacoes[0].produto_id).toBe(prodA.id);
  });

  // ⭐ As três fases num request só: uma transação, UMA linha de auditoria e
  // uma reagregação — não duas edições costuradas.
  it('17) produtos + serviços no mesmo request', async () => {
    const p = await criarPedido();

    const res = await editar(p.id, {
      veiculo: 'Onix 2020',
      itens_produto: [{ produto_id: prodB.id, quantidade: 2, valor_unit: 400 }],
      itens_servico: [{ descricao: 'Instalacao dupla', quantidade: 2, mao_obra_unit: 300 }],
    });
    expect(res.status).toBe(200);

    expect(await prisma.venda_auditoria.count()).toBe(1); // UMA linha
    const depois = await conferirInvariante(p.id);
    expect(depois.veiculo).toBe('Onix 2020');
    expect(await saidasDe(prodA.id)).toBe(0);
    expect(await saidasDe(prodB.id)).toBe(2);
    expect(n(depois.valor_mao_obra)).toBe(600);
    expect(n(depois.valor_total)).toBe(1400); // 800 + 600
  });

  it('18) quinzena fechada: 200 e snapshot de comissão intacto', async () => {
    const p = await criarPedido();
    await prisma.pedido_som.update({
      where: { id: p.id }, data: { created_at: new Date('2026-01-05T12:00:00Z') },
    });
    const periodo = await prisma.comissao_periodo.create({
      data: {
        data_inicio: new Date('2026-01-01T03:00:00Z'),
        data_fim: new Date('2026-01-16T02:59:59Z'),
        itens: {
          create: [{
            vendedor: 'Joel', qtd_baterias: 0,
            base_mao_obra: '400.00', base_insulfilme: '0.00', valor_comissao: '120.00',
            snap_valor_bateria: '15.00', snap_percentual: '30.00', snap_percentual_insulfilme: '25.00',
          }],
        },
      },
      include: { itens: true },
    });
    const snapAntes = JSON.stringify(periodo.itens);

    const res = await editar(p.id, {
      itens_produto: [{ produto_id: prodA.id, quantidade: 5, valor_unit: 300 }],
    });
    expect(res.status).toBe(200);

    const itensDepois = await prisma.comissao_periodo_item.findMany({ where: { periodo_id: periodo.id } });
    expect(JSON.stringify(itensDepois)).toBe(snapAntes);
  });

  it('19) editar só produto NÃO mexe na comissão do Joel', async () => {
    const p = await criarPedido();
    const antes = await request(app).get('/api/comissao/painel').set(authAdmin());
    const joelAntes = antes.body.data.vendedores.find((v) => v.vendedor === 'Joel');

    await editar(p.id, {
      itens_produto: [{ produto_id: prodA.id, quantidade: 6, valor_unit: 300 }],
    });

    const depois = await request(app).get('/api/comissao/painel').set(authAdmin());
    const joelDepois = depois.body.data.vendedores.find((v) => v.vendedor === 'Joel');
    expect(joelDepois.valor_comissao).toBe(joelAntes.valor_comissao);
    expect(joelDepois.base_mao_obra).toBe(joelAntes.base_mao_obra);
  });

  it('20) receita de produtos e taxa acompanham no /vendas-resumo', async () => {
    const p = await criarPedido();
    const antes = await request(app).get('/api/vendas-resumo').set(authAdmin());
    expect(antes.body.data.som.receitaProdutos).toBe(600);

    await editar(p.id, {
      itens_produto: [{ produto_id: prodA.id, quantidade: 5, valor_unit: 300 }],
    });

    const depois = await request(app).get('/api/vendas-resumo').set(authAdmin());
    expect(depois.body.data.som.receitaProdutos).toBe(1500);
    expect(depois.body.data.som.vendasBrutas).toBe(1900); // 1500 + 400
    expect(depois.body.data.som.taxas).toBeGreaterThan(antes.body.data.som.taxas);
  });
});

/* ─────────────── 21–24: contrato, limites, concorrência ─────────────── */

describe('Contrato, limites e concorrência', () => {
  it('21) admin-only e campos proibidos', async () => {
    const p = await criarPedido();

    const semPermissao = await request(app)
      .put(`/api/pedido-som/${p.id}`).set(authUser())
      .send({ itens_produto: [{ produto_id: prodA.id, quantidade: 1, valor_unit: 300 }] });
    expect(semPermissao.status).toBe(403);

    for (const proibido of [{ created_at: new Date().toISOString() }, { valor_total: '1.00' }]) {
      const res = await editar(p.id, proibido);
      expect(res.status).toBe(400);
    }

    expect(await saidasDe(prodA.id)).toBe(2);
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });

  it('22) produto inexistente, quantidade 0 e valor_unit ausente → 400/404', async () => {
    const p = await criarPedido();

    const inexistente = await editar(p.id, {
      itens_produto: [{ produto_id: 999999, quantidade: 1, valor_unit: 300 }],
    });
    expect(inexistente.status).toBe(404);

    const qtdZero = await editar(p.id, {
      itens_produto: [{ produto_id: prodA.id, quantidade: 0, valor_unit: 300 }],
    });
    expect(qtdZero.status).toBe(400);

    const semValor = await editar(p.id, {
      itens_produto: [{ produto_id: prodA.id, quantidade: 1 }],
    });
    expect(semValor.status).toBe(400);

    expect(await saidasDe(prodA.id)).toBe(2);
  });

  it('23) 50 itens conclui; 51 → 400 pelo teto do Zod', async () => {
    const prodGrande = await criarProduto('Estoque Grande', 500);
    const p = await criarPedido([{ produto_id: () => prodGrande.id, quantidade: 1, valor_unit: 10 }]);

    const cinquenta = Array.from({ length: 50 }, () => ({
      produto_id: prodGrande.id, quantidade: 1, valor_unit: 10,
    }));
    const ok = await editar(p.id, { itens_produto: cinquenta });
    expect(ok.status).toBe(200);
    expect(await saidasDe(prodGrande.id)).toBe(50);

    const excesso = await editar(p.id, {
      itens_produto: [...cinquenta, { produto_id: prodGrande.id, quantidade: 1, valor_unit: 10 }],
    });
    expect(excesso.status).toBe(400);
    expect(excesso.body.message).toMatch(/50/);
    expect(await saidasDe(prodGrande.id)).toBe(50); // nada mudou
  });

  // O increment atômico (SET saidas = saidas + n) não perde update; o
  // read-modify-write anterior perderia. O SQLite serializa as escritas, então
  // isto confirma o resultado final, não o paralelismo real do MySQL.
  it('24) duas edições em sequência não perdem baixa (increment atômico)', async () => {
    const p1 = await criarPedido();
    const p2 = await criarPedido();
    expect(await saidasDe(prodA.id)).toBe(4); // 2 + 2

    await editar(p1.id, { itens_produto: [{ produto_id: prodA.id, quantidade: 3, valor_unit: 300 }] });
    await editar(p2.id, { itens_produto: [{ produto_id: prodA.id, quantidade: 5, valor_unit: 300 }] });

    expect(await saidasDe(prodA.id)).toBe(8); // 3 + 5, nenhuma perdida
  });
});
