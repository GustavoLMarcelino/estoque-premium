// Fase C2 — editar itens de serviço (mão de obra) de um pedido de Som.
//
// A C2 mexe em DINHEIRO: mão de obra entra em valor_total, então editá-la move
// receita, taxa e comissão de uma vez. Os testes cobrem as três coisas que isso
// exige:
//   • o recálculo fecha — o cabeçalho sempre bate com a soma dos itens;
//   • o que é da Fase D não se move — estoque, itens PRODUTO e movimentações;
//   • o histórico não é reprecificado nem recomissionado — item não tocado
//     mantém o valor E a % gravados, seja qual for a config de hoje.
//
// A prova de rollback (⭐) não usa mock: reaproveita o 400 real de serviço sem
// valor, que dispara DEPOIS de a auditoria já estar gravada.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

let somId;

beforeEach(async () => {
  await prisma.venda_auditoria.deleteMany();
  await prisma.comissao_periodo_item.deleteMany();
  await prisma.comissao_periodo.deleteMany();
  // Zera a config: o teste 10 grava 99% de propósito para provar que pedido
  // antigo NÃO é recomissionado. Sem este reset, esses 99% vazavam para os
  // testes seguintes (a rota recria a config padrão sozinha quando não há).
  await prisma.comissao_config.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.estoque_som.deleteMany();

  const marca = await prisma.marca.upsert({
    where: { nome: 'Pioneer' }, update: {}, create: { nome: 'Pioneer' },
  });

  somId = (await prisma.estoque_som.create({
    data: {
      produto: 'Multimidia', modelo: 'MM-9', marca_id: marca.id,
      custo: '200.00', valor_venda: '600.00', valor_vista: '600.00',
      valor_parcelado: '660.00', qtd_minima: 1,
      qtd_inicial: 20, entradas: 0, saidas: 0,
    },
  })).id;

});

/** Pedido com 1 produto (2 un., baixa estoque) + 1 serviço manual de 400. */
async function criarPedido(itensExtra = [], extra = {}) {
  const res = await request(app).post('/api/pedido-som').set(authAdmin()).send({
    veiculo: 'Gol 2015',
    forma_pagamento: 'PIX',
    itens: [
      { tipo: 'PRODUTO', produto_id: somId, descricao: 'Multimidia', quantidade: 2, valor_unit: 600 },
      { tipo: 'MAO_OBRA', descricao: 'Instalacao', quantidade: 1, valor_unit: 400 },
      ...itensExtra,
    ],
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

const editar = (id, body) =>
  request(app).put(`/api/pedido-som/${id}`).set(authAdmin()).send(body);

const pedidoDo = (id) => prisma.pedido_som.findUnique({ where: { id }, include: { itens: true } });
const n = (v) => Number(v ?? 0);

/** Estado que a Fase C2 não pode encostar. */
async function fotoFaseD(pedidoId) {
  const [produto, produtos, movs] = await Promise.all([
    prisma.estoque_som.findUnique({ where: { id: somId } }),
    prisma.pedido_som_item.findMany({ where: { pedido_id: pedidoId, tipo: 'PRODUTO' }, orderBy: { id: 'asc' } }),
    prisma.movimentacoes_som.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return {
    estoque: { entradas: produto.entradas, saidas: produto.saidas },
    itensProduto: JSON.stringify(produtos),
    movs: JSON.stringify(movs),
  };
}

/** O invariante do pedido: cabeçalho tem que fechar com os itens. */
async function conferirInvariante(pedidoId) {
  const p = await pedidoDo(pedidoId);
  const somaMaoObra = p.itens.reduce((acc, it) => acc + n(it.mao_obra_total), 0);
  const somaProdutos = p.itens
    .filter((it) => it.tipo === 'PRODUTO')
    .reduce((acc, it) => acc + n(it.valor_total), 0);

  expect(n(p.valor_mao_obra)).toBeCloseTo(somaMaoObra, 2);
  expect(n(p.valor_total)).toBeCloseTo(somaProdutos + somaMaoObra, 2);
  return p;
}

const joel = async () => {
  const { body } = await request(app).get('/api/comissao/painel').set(authAdmin());
  return body.data.vendedores.find((v) => v.vendedor === 'Joel');
};
const somDoResumo = async () => {
  const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());
  return body.data.som;
};

/* ─────────────────────── 1–4: recálculo e split ─────────────────────── */

describe('Recálculo dos derivados', () => {
  it('1) editar a mão de obra de um serviço recalcula valor_mao_obra', async () => {
    const p = await criarPedido();
    expect(n((await pedidoDo(p.id)).valor_mao_obra)).toBe(400);

    const res = await editar(p.id, {
      itens_servico: [{ descricao: 'Instalacao', quantidade: 1, mao_obra_unit: 550 }],
    });
    expect(res.status).toBe(200);
    expect(n((await pedidoDo(p.id)).valor_mao_obra)).toBe(550);
  });

  // ⭐ O invariante que sustenta a comissão: se o cabeçalho descolar dos itens,
  // a apuração do Joel passa a pagar um número que ninguém consegue reconstruir.
  it('2) INVARIANTE: cabeçalho = Σ itens, antes e depois', async () => {
    const p = await criarPedido();
    await conferirInvariante(p.id);

    await editar(p.id, {
      itens_servico: [
        { descricao: 'Instalacao', quantidade: 2, mao_obra_unit: 250 },
        { descricao: 'Alinhamento', quantidade: 1, mao_obra_unit: 75 },
      ],
    });

    const depois = await conferirInvariante(p.id);
    expect(n(depois.valor_mao_obra)).toBe(575);   // 2×250 + 75
    expect(n(depois.valor_total)).toBe(1775);     // 1200 de produto + 575
  });

  it('3) dois serviços com % diferentes: comissão soma item a item', async () => {
    const p = await criarPedido();

    await editar(p.id, {
      itens_servico: [
        { descricao: 'Instalacao Som', quantidade: 1, mao_obra_unit: 400, percentual_comissao: 30 },
        { descricao: 'Insulfilme Completo', quantidade: 1, mao_obra_unit: 380, percentual_comissao: 25 },
      ],
    });

    const depois = await conferirInvariante(p.id);
    expect(n(depois.valor_mao_obra)).toBe(780);
    expect(depois.valor_mao_obra_insulfilme).toBeNull(); // campo não é mais escrito
    // 400 × 30% + 380 × 25% = 120 + 95
    expect(n(depois.comissao_joel)).toBe(215);
  });

  it('4) serviço único a 25%', async () => {
    const p = await criarPedido();

    await editar(p.id, {
      itens_servico: [{ descricao: 'Insulfilme', quantidade: 1, mao_obra_unit: 300, percentual_comissao: 25 }],
    });

    const depois = await conferirInvariante(p.id);
    expect(n(depois.valor_mao_obra)).toBe(300);
    expect(n(depois.comissao_joel)).toBe(75); // 300 × 25%
  });
});

/* ─────────────────── 5–7: o território da Fase D ─────────────────── */

describe('Nada de estoque se move (Fase D fica fora)', () => {
  it('5-7) estoque_som, itens PRODUTO e movimentacoes_som ficam idênticos', async () => {
    const p = await criarPedido();
    const antes = await fotoFaseD(p.id);

    await editar(p.id, {
      itens_servico: [
        { descricao: 'Instalacao', quantidade: 3, mao_obra_unit: 199.99 },
        { descricao: 'Insulfilme', quantidade: 2, mao_obra_unit: 380, percentual_comissao: 25 },
      ],
    });

    const depois = await fotoFaseD(p.id);
    expect(depois.estoque).toEqual(antes.estoque);       // 5
    expect(depois.itensProduto).toBe(antes.itensProduto); // 6
    expect(depois.movs).toBe(antes.movs);                 // 7
  });
});

/* ─────────────────── 8–11: adicionar, remover, legado ─────────────────── */

describe('Adicionar, remover e produto legado', () => {
  it('8) adicionar serviço sobe mão de obra e total; produtos ficam iguais', async () => {
    const p = await criarPedido();
    const antes = await fotoFaseD(p.id);

    await editar(p.id, {
      itens_servico: [
        { descricao: 'Instalacao', quantidade: 1, mao_obra_unit: 400 },
        { descricao: 'Modulo extra', quantidade: 1, mao_obra_unit: 150 },
      ],
    });

    const depois = await conferirInvariante(p.id);
    expect(n(depois.valor_mao_obra)).toBe(550);
    expect(depois.itens.filter((i) => i.tipo === 'MAO_OBRA')).toHaveLength(2);
    expect((await fotoFaseD(p.id)).itensProduto).toBe(antes.itensProduto);
  });

  it('9) lista vazia remove todos os serviços; total vira só os produtos', async () => {
    const p = await criarPedido();

    const res = await editar(p.id, { itens_servico: [] });
    expect(res.status).toBe(200);

    const depois = await pedidoDo(p.id);
    expect(depois.itens.filter((i) => i.tipo === 'MAO_OBRA')).toHaveLength(0);
    expect(depois.valor_mao_obra).toBeNull();
    expect(depois.comissao_joel).toBeNull();
    expect(n(depois.valor_total)).toBe(1200); // 2 × 600, só o produto
  });

  // ⭐ Recomissionar pela config de hoje mudaria a comissão de todo pedido
  // antigo assim que alguém ajustasse o percentual. A % gravada é a que vale.
  it('10) NÃO recomissiona: item não tocado mantém a % gravada', async () => {
    const p = await criarPedido([
      { tipo: 'MAO_OBRA', descricao: 'Insulfilme', valor_unit: 400, percentual_comissao: 25 },
    ]);
    // 400 manual a 30% + 400 de Insulfilme a 25% = 120 + 100
    expect(n((await pedidoDo(p.id)).comissao_joel)).toBe(220);

    // A config muda DEPOIS do pedido lançado.
    await prisma.comissao_config.deleteMany();
    await prisma.comissao_config.create({
      data: { valor_bateria: '15.00', percentual_mao_obra: '99.00', percentual_insulfilme: '99.00' },
    });

    // A tela reenvia os itens existentes com valor E % GRAVADOS.
    await editar(p.id, {
      itens_servico: [
        { descricao: 'Instalacao', quantidade: 1, mao_obra_unit: 400, percentual_comissao: 30 },
        { descricao: 'Insulfilme', quantidade: 1, mao_obra_unit: 400, percentual_comissao: 25 },
      ],
    });

    const depois = await conferirInvariante(p.id);
    const pcts = depois.itens
      .filter((i) => i.tipo === 'MAO_OBRA')
      .map((i) => n(i.percentual_comissao))
      .sort((a, b) => a - b);
    expect(pcts).toEqual([25, 30]); // nada virou 99
    expect(n(depois.comissao_joel)).toBe(220);
  });

  it('11) mão de obra de item PRODUTO legado: edita o valor sem tocar estoque', async () => {
    const p = await criarPedido();
    const itemProduto = (await pedidoDo(p.id)).itens.find((i) => i.tipo === 'PRODUTO');
    const antes = await fotoFaseD(p.id);

    const res = await editar(p.id, {
      mao_obra_produtos: [{ item_id: itemProduto.id, mao_obra_unit: 90 }],
    });
    expect(res.status).toBe(200);

    const depois = await conferirInvariante(p.id);
    const produtoDepois = depois.itens.find((i) => i.id === itemProduto.id);
    expect(n(produtoDepois.mao_obra_unit)).toBe(90);
    expect(n(produtoDepois.mao_obra_total)).toBe(180);  // 2 un.
    expect(produtoDepois.produto_id).toBe(itemProduto.produto_id); // intocado
    expect(produtoDepois.quantidade).toBe(itemProduto.quantidade);
    expect(produtoDepois.baixa_estoque).toBe(itemProduto.baixa_estoque);
    expect(n(depois.valor_mao_obra)).toBe(580);        // 400 do serviço + 180
    expect((await fotoFaseD(p.id)).estoque).toEqual(antes.estoque);
  });
});

/* ─────────────── 12–14: comissão viva, quinzena fechada, taxa ─────────────── */

describe('Efeito na comissão e no dashboard', () => {
  it('12) quinzena ABERTA: /comissao/painel do Joel reflete o valor novo', async () => {
    const p = await criarPedido();
    const antes = await joel();
    expect(antes.base_mao_obra).toBe(400);

    await editar(p.id, {
      itens_servico: [{ descricao: 'Instalacao', quantidade: 1, mao_obra_unit: 900 }],
    });

    const depois = await joel();
    expect(depois.base_mao_obra).toBe(900);
    expect(depois.valor_comissao).toBe(270); // 900 × 30%
  });

  // ⭐ O snapshot é o que já foi PAGO: não se recalcula. O pedido passa a
  // divergir daquela apuração — e essa divergência é a decisão, não um bug.
  it('13) quinzena FECHADA: edita, snapshot intacto, e o GET avisa', async () => {
    const p = await criarPedido();
    const antigo = new Date('2026-01-05T12:00:00Z');
    await prisma.pedido_som.update({ where: { id: p.id }, data: { created_at: antigo } });

    const periodo = await prisma.comissao_periodo.create({
      data: {
        data_inicio: new Date('2026-01-01T03:00:00Z'),
        data_fim: new Date('2026-01-16T02:59:59Z'),
        itens: {
          create: [{
            vendedor: 'Joel', qtd_baterias: 0,
            base_mao_obra: '400.00', valor_comissao: '120.00',
            snap_valor_bateria: '15.00', snap_percentual_efetivo: '30.00',
          }],
        },
      },
      include: { itens: true },
    });
    const snapAntes = JSON.stringify(periodo.itens);

    // O GET marca o pedido como de período fechado — é o que o front usa para
    // avisar ANTES de salvar.
    const get = await request(app).get(`/api/pedido-som/${p.id}`).set(authAdmin());
    expect(get.body.data.periodo_fechado).toBe(true);

    const res = await editar(p.id, {
      itens_servico: [{ descricao: 'Instalacao', quantidade: 1, mao_obra_unit: 1000 }],
    });
    expect(res.status).toBe(200); // permite, não bloqueia

    const itensDepois = await prisma.comissao_periodo_item.findMany({ where: { periodo_id: periodo.id } });
    expect(JSON.stringify(itensDepois)).toBe(snapAntes);       // pago, intacto
    expect(n((await pedidoDo(p.id)).valor_mao_obra)).toBe(1000); // divergência intencional
  });

  it('14) receita e taxa de Som acompanham o novo valor_total', async () => {
    const p = await criarPedido();
    const antes = await somDoResumo();
    expect(antes.vendasBrutas).toBe(1600);

    await editar(p.id, {
      itens_servico: [{ descricao: 'Instalacao', quantidade: 1, mao_obra_unit: 900 }],
    });

    const depois = await somDoResumo();
    expect(depois.vendasBrutas).toBe(2100);           // 1200 + 900
    expect(depois.receitaMaoObra).toBe(900);
    expect(depois.receitaProdutos).toBe(1200);
    expect(depois.taxas).toBeGreaterThan(antes.taxas); // taxa incide sobre o total
  });
});

/* ─────────────────── 15–16: auditoria e rollback ─────────────────── */

describe('Auditoria', () => {
  it('15) grava o estado ANTERIOR dos itens (a única cópia do que sumiu)', async () => {
    const p = await criarPedido();

    await editar(p.id, {
      itens_servico: [{ descricao: 'Outro servico', quantidade: 1, mao_obra_unit: 50 }],
    });

    const linhas = await prisma.venda_auditoria.findMany();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].acao).toBe('EDICAO');
    const snap = JSON.parse(linhas[0].conteudo_anterior);
    expect(snap.pedido.valor_mao_obra).toBe('400');
    const servicoAntigo = snap.itens.find((i) => i.tipo === 'MAO_OBRA');
    expect(servicoAntigo.descricao).toBe('Instalacao');
    expect(servicoAntigo.mao_obra_total).toBe('400');
  });

  // ⭐ O log é gravado ANTES de destruir os itens. Falha depois dele tem que
  // levar tudo embora — senão fica registro de uma edição que não aconteceu.
  it('16) ROLLBACK: serviço inválido → diário volta a 0 e o pedido segue igual', async () => {
    const p = await criarPedido();
    const antes = await pedidoDo(p.id);

    const res = await editar(p.id, {
      itens_servico: [
        { descricao: 'Instalacao', quantidade: 1, mao_obra_unit: 400 },
        { descricao: 'Sem valor', quantidade: 1 },
      ],
    });
    expect(res.status).toBe(400);

    expect(await prisma.venda_auditoria.count()).toBe(0); // ← o log sumiu junto
    const depois = await pedidoDo(p.id);
    expect(depois.itens).toHaveLength(antes.itens.length);
    expect(n(depois.valor_mao_obra)).toBe(400);
    expect(n(depois.valor_total)).toBe(1600);
  });
});

/* ─────────────────── 17–20: contrato, validação, permissão ─────────────────── */

describe('Contrato e validação', () => {
  it('17) o nome genérico "itens" continua barrado (item PRODUTO não entra)', async () => {
    const p = await criarPedido();

    const res = await editar(p.id, {
      itens: [{ tipo: 'PRODUTO', produto_id: somId, quantidade: 99, valor_unit: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/itens/);

    // e nada moveu
    expect((await prisma.estoque_som.findUnique({ where: { id: somId } })).saidas).toBe(2);
  });

  it('18) serviço manual sem descrição ou sem valor → 400', async () => {
    const p = await criarPedido();

    const semValor = await editar(p.id, { itens_servico: [{ descricao: 'X', quantidade: 1 }] });
    expect(semValor.status).toBe(400);
    expect(semValor.body.message).toMatch(/mão de obra/i);

    const semDescricao = await editar(p.id, { itens_servico: [{ quantidade: 1, mao_obra_unit: 10 }] });
    expect(semDescricao.status).toBe(400);
    expect(semDescricao.body.message).toMatch(/descri/i);

    const qtdZero = await editar(p.id, {
      itens_servico: [{ descricao: 'X', quantidade: 0, mao_obra_unit: 10 }],
    });
    expect(qtdZero.status).toBe(400);

    expect(n((await pedidoDo(p.id)).valor_mao_obra)).toBe(400); // nada gravado
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });

  it('19) admin-only: usuário comum toma 403', async () => {
    const p = await criarPedido();

    const res = await request(app)
      .put(`/api/pedido-som/${p.id}`).set(authUser())
      .send({ itens_servico: [{ descricao: 'X', quantidade: 1, mao_obra_unit: 10 }] });

    expect(res.status).toBe(403);
    expect(n((await pedidoDo(p.id)).valor_mao_obra)).toBe(400);
  });

  it('20) centavos: a soma dos itens fecha com o cabeçalho', async () => {
    const p = await criarPedido();

    await editar(p.id, {
      itens_servico: [
        { descricao: 'A', quantidade: 3, mao_obra_unit: 33.33 }, // 99.99
        { descricao: 'B', quantidade: 3, mao_obra_unit: 16.67 }, // 50.01
        { descricao: 'C', quantidade: 1, mao_obra_unit: 0.01 },  //  0.01
      ],
    });

    const depois = await conferirInvariante(p.id);
    expect(n(depois.valor_mao_obra)).toBe(150.01);
    expect(n(depois.valor_total)).toBe(1350.01);
  });
});

/* ─────────────────── fix do vazamento de comissão ─────────────────── */

describe('Vazamento: mão de obra por item some para não-admin', () => {
  it('não-admin com linha Som não recebe mao_obra_unit/total nos itens', async () => {
    const p = await criarPedido();

    const admin = await request(app).get(`/api/pedido-som/${p.id}`).set(authAdmin());
    const itemAdmin = admin.body.data.itens.find((i) => i.tipo === 'MAO_OBRA');
    expect(itemAdmin.mao_obra_unit).toBeDefined();
    expect(itemAdmin.mao_obra_total).toBeDefined();

    const user = await request(app).get(`/api/pedido-som/${p.id}`).set(authUser());
    expect(user.status).toBe(200);
    expect(user.body.data.valor_mao_obra).toBeUndefined();
    for (const it of user.body.data.itens) {
      expect(it.mao_obra_unit).toBeUndefined();
      expect(it.mao_obra_total).toBeUndefined();
      expect(it.descricao).toBeDefined(); // o resto do item continua visível
    }
    // periodo_fechado também é dado de comissão: só admin.
    expect(user.body.data.periodo_fechado).toBeUndefined();
  });

  it('a listagem também sanitiza os itens', async () => {
    await criarPedido();

    const user = await request(app).get('/api/pedido-som').set(authUser());
    expect(user.status).toBe(200);
    for (const it of user.body.data[0].itens) {
      expect(it.mao_obra_total).toBeUndefined();
    }
  });
});
