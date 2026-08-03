import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

let produtoId;
let classeId; // classe "Alarme" (mão de obra 200, categoria SOM)
let classeInsulfId; // classe "Insulfilme Padrão" (380, categoria INSULFILME)
let produtoComClasseId; // produto que puxa mão de obra automática da classe

beforeEach(async () => {
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque_som.deleteMany();
  const marca = await prisma.marca.upsert({ where: { nome: 'Acdelco' }, update: {}, create: { nome: 'Acdelco' } });
  classeId = (
    await prisma.classe_som.upsert({
      where: { nome: 'Alarme' },
      update: { valor_mao_obra: '200.00', ativo: true, categoria: 'SOM' },
      create: { nome: 'Alarme', valor_mao_obra: '200.00' },
    })
  ).id;
  classeInsulfId = (
    await prisma.classe_som.upsert({
      where: { nome: 'Insulfilme Padrão' },
      update: { valor_mao_obra: '380.00', ativo: true, categoria: 'INSULFILME' },
      create: { nome: 'Insulfilme Padrão', valor_mao_obra: '380.00', categoria: 'INSULFILME' },
    })
  ).id;
  produtoId = (
    await prisma.estoque_som.create({
      data: {
        produto: 'Alto-falante', modelo: 'AF-6', marca_id: marca.id, custo: '80.00', valor_venda: '150.00',
        qtd_minima: 1, qtd_inicial: 10, entradas: 0, saidas: 0,
      },
    })
  ).id;
  produtoComClasseId = (
    await prisma.estoque_som.create({
      data: {
        produto: 'Central Multimídia', modelo: 'MM-1', marca_id: marca.id, classe_id: classeId,
        custo: '400.00', valor_venda: '900.00', qtd_minima: 1, qtd_inicial: 5, entradas: 0, saidas: 0,
      },
    })
  ).id;
});

const criarPedido = (itens, auth = authAdmin()) =>
  request(app).post('/api/pedido-som').set(auth).send({ veiculo: 'Gol', forma_pagamento: 'pix', itens });

describe('POST /api/pedido-som — comissão e baixa de estoque', () => {
  it('comissão do Joel = 30% da mão de obra; total soma produto + mão de obra', async () => {
    const res = await criarPedido([
      { tipo: 'MAO_OBRA', descricao: 'Instalação som', valor_unit: 300 },
      { tipo: 'PRODUTO', produto_id: produtoId, quantidade: 2, valor_unit: 150 },
    ]);
    expect(res.status).toBe(201);
    const pedido = res.body.data;
    expect(Number(pedido.valor_mao_obra)).toBe(300);
    expect(Number(pedido.comissao_joel)).toBe(90); // 30% de 300
    expect(Number(pedido.valor_total)).toBe(600); // 300 mão de obra + 2×150
    expect(pedido.itens).toHaveLength(2);
  });

  it('pedido só com produto não gera mão de obra nem comissão', async () => {
    const res = await criarPedido([{ tipo: 'PRODUTO', produto_id: produtoId, quantidade: 1, valor_unit: 150 }]);
    expect(res.status).toBe(201);
    expect(res.body.data.valor_mao_obra).toBeNull();
    expect(res.body.data.comissao_joel).toBeNull();
  });

  it('item PRODUTO dá baixa no estoque e registra movimentação com motivo do pedido', async () => {
    const res = await criarPedido([{ tipo: 'PRODUTO', produto_id: produtoId, quantidade: 2, valor_unit: 150 }]);
    const pedidoId = res.body.data.id;
    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(2);
    const mov = await prisma.movimentacoes_som.findFirst();
    expect(mov.tipo).toBe('SAIDA');
    expect(mov.quantidade).toBe(2);
    expect(mov.motivo).toBe(`Pedido Som #${pedidoId}`);
  });

  it('produto com classe puxa mão de obra automática da classe (por unidade)', async () => {
    const res = await criarPedido([
      { tipo: 'PRODUTO', produto_id: produtoComClasseId, quantidade: 2, valor_unit: 900 },
    ]);
    expect(res.status).toBe(201);
    const pedido = res.body.data;
    // 2 × 200 (classe) = 400 de mão de obra; produto 2 × 900 = 1800
    expect(Number(pedido.valor_mao_obra)).toBe(400);
    expect(Number(pedido.comissao_joel)).toBe(120); // 30% de 400
    expect(Number(pedido.valor_total)).toBe(2200); // 1800 + 400
    const item = pedido.itens.find((i) => i.tipo === 'PRODUTO');
    expect(Number(item.mao_obra_unit)).toBe(200);
    expect(Number(item.mao_obra_total)).toBe(400);
    expect(item.classe_id).toBeNull(); // classe vem do produto, não gravada no item PRODUTO
  });

  it('serviço avulso por classe: mão de obra = valor da classe × qtd, sem produto/baixa', async () => {
    const res = await criarPedido([
      { tipo: 'MAO_OBRA', classe_id: classeId, quantidade: 4 }, // ex.: 4 travas
    ]);
    expect(res.status).toBe(201);
    const pedido = res.body.data;
    expect(Number(pedido.valor_mao_obra)).toBe(800); // 4 × 200
    expect(Number(pedido.comissao_joel)).toBe(240);
    expect(Number(pedido.valor_total)).toBe(800); // só mão de obra
    const item = pedido.itens[0];
    expect(item.classe_id).toBe(classeId);
    expect(item.descricao).toBe('Alarme'); // autofill pelo nome da classe
    expect(item.baixa_estoque).toBe(false);
    expect(Number(item.valor_total)).toBe(0); // serviço não tem preço de produto
  });

  it('combo Alarme + 4 Travas + produto: soma a mão de obra de todos os itens', async () => {
    const res = await criarPedido([
      { tipo: 'PRODUTO', produto_id: produtoComClasseId, quantidade: 1, valor_unit: 900 }, // +200 classe
      { tipo: 'MAO_OBRA', classe_id: classeId, quantidade: 4 }, // +800
      { tipo: 'MAO_OBRA', descricao: 'Ajuste avulso', valor_unit: 50 }, // manual +50
    ]);
    expect(res.status).toBe(201);
    const pedido = res.body.data;
    expect(Number(pedido.valor_mao_obra)).toBe(1050); // 200 + 800 + 50
    expect(Number(pedido.comissao_joel)).toBe(315); // 30% de 1050
    expect(Number(pedido.valor_total)).toBe(1950); // 900 produto + 1050 mão de obra
  });

  it('override de mão de obra no produto sobrescreve o valor da classe', async () => {
    const res = await criarPedido([
      { tipo: 'PRODUTO', produto_id: produtoComClasseId, quantidade: 2, valor_unit: 900, mao_obra_unit: 150 },
    ]);
    expect(res.status).toBe(201);
    const pedido = res.body.data;
    expect(Number(pedido.valor_mao_obra)).toBe(300); // 2 × 150 (override), não 2 × 200
    expect(Number(pedido.comissao_joel)).toBe(90);
    const item = pedido.itens[0];
    expect(Number(item.mao_obra_unit)).toBe(150);
    expect(Number(item.mao_obra_total)).toBe(300);
  });

  it('override 0 zera a mão de obra do produto com classe', async () => {
    const res = await criarPedido([
      { tipo: 'PRODUTO', produto_id: produtoComClasseId, quantidade: 1, valor_unit: 900, mao_obra_unit: 0 },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data.valor_mao_obra).toBeNull(); // 0 → sem mão de obra
    expect(res.body.data.comissao_joel).toBeNull();
    expect(Number(res.body.data.valor_total)).toBe(900); // só o produto
  });

  it('override de mão de obra no serviço por classe', async () => {
    const res = await criarPedido([
      { tipo: 'MAO_OBRA', classe_id: classeId, quantidade: 4, mao_obra_unit: 50 },
    ]);
    expect(res.status).toBe(201);
    expect(Number(res.body.data.valor_mao_obra)).toBe(200); // 4 × 50 (override), não 4 × 200
  });

  it('serviço de Insulfilme: grava valor_mao_obra_insulfilme e comissão a 25%', async () => {
    const res = await criarPedido([
      { tipo: 'MAO_OBRA', classe_id: classeInsulfId, quantidade: 1 }, // 380
    ]);
    expect(res.status).toBe(201);
    const pedido = res.body.data;
    expect(Number(pedido.valor_mao_obra)).toBe(380);
    expect(Number(pedido.valor_mao_obra_insulfilme)).toBe(380);
    expect(Number(pedido.comissao_joel)).toBe(95); // 380 × 25%
  });

  it('pedido misto Som + Insulfilme: comissão blended (30% + 25%)', async () => {
    const res = await criarPedido([
      { tipo: 'MAO_OBRA', classe_id: classeId, quantidade: 1 },       // Som 200
      { tipo: 'MAO_OBRA', classe_id: classeInsulfId, quantidade: 1 }, // Insulfilme 380
    ]);
    expect(res.status).toBe(201);
    const pedido = res.body.data;
    expect(Number(pedido.valor_mao_obra)).toBe(580); // 200 + 380
    expect(Number(pedido.valor_mao_obra_insulfilme)).toBe(380);
    // 200×30% + 380×25% = 60 + 95 = 155
    expect(Number(pedido.comissao_joel)).toBe(155);
  });

  it('override no serviço de Insulfilme mantém a categoria (25%)', async () => {
    const res = await criarPedido([
      { tipo: 'MAO_OBRA', classe_id: classeInsulfId, quantidade: 1, mao_obra_unit: 300 },
    ]);
    expect(res.status).toBe(201);
    expect(Number(res.body.data.valor_mao_obra_insulfilme)).toBe(300);
    expect(Number(res.body.data.comissao_joel)).toBe(75); // 300 × 25%
  });

  it('serviço sem classe e sem valor manual → 400', async () => {
    const res = await criarPedido([{ tipo: 'MAO_OBRA', quantidade: 1 }]);
    expect(res.status).toBe(400);
    expect(await prisma.pedido_som.count()).toBe(0);
  });

  it('estoque insuficiente → 409 e transação inteira desfeita (sem pedido, sem baixa)', async () => {
    const res = await criarPedido([{ tipo: 'PRODUTO', produto_id: produtoId, quantidade: 99, valor_unit: 150 }]);
    expect(res.status).toBe(409);
    expect(await prisma.pedido_som.count()).toBe(0);
    expect(await prisma.movimentacoes_som.count()).toBe(0);
    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(0);
  });
});

// Nº de parcelas do crédito (1–10), espelhando movimentacoes.parcelas de
// Baterias. O dado é insumo da taxa de maquininha (faixa 2x–6x vs 7x–10x +
// antecipação por parcela) — NÃO altera preço, total nem comissão.
describe('POST /api/pedido-som — parcelas do crédito', () => {
  const criarCom = (extra) =>
    request(app).post('/api/pedido-som').set(authAdmin()).send({
      veiculo: 'Gol',
      itens: [{ tipo: 'PRODUTO', produto_id: produtoId, quantidade: 1, valor_unit: 150 }],
      ...extra,
    });

  it('crédito com parcelas: persiste o número informado', async () => {
    const res = await criarCom({ forma_pagamento: 'Crédito 6x', parcelas: 6 });
    expect(res.status).toBe(201);
    const pedido = await prisma.pedido_som.findUnique({ where: { id: res.body.data.id } });
    expect(pedido.forma_pagamento).toBe('Crédito 6x');
    expect(pedido.parcelas).toBe(6);
  });

  it('crédito sem parcelas no body: default 1 (o "Crédito à vista" da tela)', async () => {
    const res = await criarCom({ forma_pagamento: 'Crédito à vista' });
    expect(res.status).toBe(201);
    const pedido = await prisma.pedido_som.findUnique({ where: { id: res.body.data.id } });
    expect(pedido.forma_pagamento).toBe('Crédito à vista');
    expect(pedido.parcelas).toBe(1);
  });

  it('grafia histórica "Crédito parcelado" continua sendo crédito', async () => {
    const res = await criarCom({ forma_pagamento: 'Crédito parcelado', parcelas: 10 });
    expect(res.status).toBe(201);
    const pedido = await prisma.pedido_som.findUnique({ where: { id: res.body.data.id } });
    expect(pedido.parcelas).toBe(10);
  });

  it.each(['Dinheiro', 'PIX', 'Débito'])(
    '%s ignora parcelas do body e grava null',
    async (forma) => {
      const res = await criarCom({ forma_pagamento: forma, parcelas: 6 });
      expect(res.status).toBe(201);
      const pedido = await prisma.pedido_som.findUnique({ where: { id: res.body.data.id } });
      expect(pedido.forma_pagamento).toBe(forma);
      expect(pedido.parcelas).toBeNull();
    },
  );

  it('sem forma de pagamento: parcelas fica null (não inventa 1x)', async () => {
    const res = await criarCom({});
    expect(res.status).toBe(201);
    const pedido = await prisma.pedido_som.findUnique({ where: { id: res.body.data.id } });
    expect(pedido.forma_pagamento).toBeNull();
    expect(pedido.parcelas).toBeNull();
  });

  it.each([0, 11, -1, 'abc', 2.5])('parcelas inválida (%s) → 400 e nenhum pedido gravado', async (v) => {
    const res = await criarCom({ forma_pagamento: 'Crédito 2x', parcelas: v });
    expect(res.status).toBe(400);
    expect(await prisma.pedido_som.count()).toBe(0);
  });

  // INVARIÂNCIA DE PREÇO: é a garantia de que esta fase não mexeu em dinheiro.
  it('2x e 10x produzem total, mão de obra e comissão IDÊNTICOS', async () => {
    const itens = [
      { tipo: 'PRODUTO', produto_id: produtoComClasseId, quantidade: 2, valor_unit: 900 },
      { tipo: 'MAO_OBRA', classe_id: classeId, quantidade: 4 },
      { tipo: 'MAO_OBRA', classe_id: classeInsulfId, quantidade: 1 },
    ];
    const enviar = (parcelas) =>
      request(app).post('/api/pedido-som').set(authAdmin())
        .send({ veiculo: 'Gol', forma_pagamento: `Crédito ${parcelas}x`, parcelas, itens });

    const em2x = await enviar(2);
    const em10x = await enviar(10);
    expect(em2x.status).toBe(201);
    expect(em10x.status).toBe(201);

    const a = em2x.body.data;
    const b = em10x.body.data;
    expect(Number(b.valor_total)).toBe(Number(a.valor_total));
    expect(Number(b.valor_mao_obra)).toBe(Number(a.valor_mao_obra));
    expect(Number(b.valor_mao_obra_insulfilme)).toBe(Number(a.valor_mao_obra_insulfilme));
    expect(Number(b.comissao_joel)).toBe(Number(a.comissao_joel));
    // e os valores continuam sendo os mesmos de antes desta fase
    expect(Number(a.valor_total)).toBe(3380); // 1800 produto + (400+800+380) mão de obra
    expect(Number(a.valor_mao_obra)).toBe(1580);
    expect(Number(a.comissao_joel)).toBe(455); // (400+800)×30% + 380×25%
    // só o que foi capturado difere
    expect(a.parcelas).toBe(2);
    expect(b.parcelas).toBe(10);
  });

  it('baixa de estoque e movimentacoes_som seguem inalteradas com parcelas', async () => {
    const res = await criarCom({ forma_pagamento: 'Crédito 10x', parcelas: 10 });
    const pedidoId = res.body.data.id;
    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(1);
    const mov = await prisma.movimentacoes_som.findFirst();
    expect(mov.tipo).toBe('SAIDA');
    expect(mov.quantidade).toBe(1);
    expect(Number(mov.valor_final)).toBe(150);
    expect(mov.motivo).toBe(`Pedido Som #${pedidoId}`);
  });
});

describe('DELETE /api/pedido-som/:id — reversão e autorização', () => {
  it('admin exclui pedido do dia: baixa revertida, movimentações e comissão removidas', async () => {
    const res = await criarPedido([
      { tipo: 'MAO_OBRA', descricao: 'Instalação', valor_unit: 300 },
      { tipo: 'PRODUTO', produto_id: produtoId, quantidade: 2, valor_unit: 150 },
    ]);
    const pedidoId = res.body.data.id;

    const del = await request(app).delete(`/api/pedido-som/${pedidoId}`).set(authAdmin());
    expect(del.status).toBe(204);

    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(0); // baixa revertida
    expect(await prisma.movimentacoes_som.count()).toBe(0); // movs do pedido removidas
    // pedido (e com ele a comissão registrada) não existe mais
    expect(await prisma.pedido_som.findUnique({ where: { id: pedidoId } })).toBeNull();
    expect(await prisma.pedido_som_item.count()).toBe(0);
  });

  it('usuário comum não pode excluir pedido → 403 e nada muda', async () => {
    const res = await criarPedido([{ tipo: 'PRODUTO', produto_id: produtoId, quantidade: 1, valor_unit: 150 }]);
    const pedidoId = res.body.data.id;

    const del = await request(app).delete(`/api/pedido-som/${pedidoId}`).set(authUser());
    expect(del.status).toBe(403);
    expect(await prisma.pedido_som.count()).toBe(1);
    const p = await prisma.estoque_som.findUnique({ where: { id: produtoId } });
    expect(p.saidas).toBe(1);
  });
});

// Formato de payload que o PedidoSomForm passa a enviar depois que o campo
// "Mão de obra (un.)" saiu do card de PRODUTO: item de produto SEM
// mao_obra_unit, mão de obra só nos itens de serviço. Trava a invariância
// (produto não contribui com mão de obra nem comissão) e o Insulfilme intacto.
describe('POST /api/pedido-som — produto é só peça; mão de obra vem do serviço', () => {
  it('produto sem mao_obra_unit + serviço Insulfilme com override', async () => {
    const res = await request(app).post('/api/pedido-som').set(authAdmin()).send({
      veiculo: 'Gol',
      forma_pagamento: 'PIX',
      itens: [
        { tipo: 'PRODUTO', produto_id: produtoId, quantidade: 2, valor_unit: 150 },
        { tipo: 'MAO_OBRA', classe_id: classeInsulfId, quantidade: 1, mao_obra_unit: 300 },
      ],
    });
    expect(res.status).toBe(201);
    const p = res.body.data;
    // produto entra só como peça: 2 × 150 = 300
    expect(Number(p.valor_total)).toBe(600); // 300 peça + 300 mão de obra
    // mão de obra vem SÓ do serviço (o produto não soma nada)
    expect(Number(p.valor_mao_obra)).toBe(300);
    expect(Number(p.valor_mao_obra_insulfilme)).toBe(300);
    // Insulfilme intacto: override respeitado e comissão a 25%
    expect(Number(p.comissao_joel)).toBe(75);
    const itemProduto = p.itens.find((i) => i.tipo === 'PRODUTO');
    expect(itemProduto.mao_obra_unit).toBeNull();
    expect(itemProduto.mao_obra_total).toBeNull();
  });

  it('pedido só de produtos: total é só peça, sem mão de obra nem comissão', async () => {
    const res = await request(app).post('/api/pedido-som').set(authAdmin()).send({
      veiculo: 'Gol',
      itens: [{ tipo: 'PRODUTO', produto_id: produtoId, quantidade: 3, valor_unit: 150 }],
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.valor_total)).toBe(450);
    expect(res.body.data.valor_mao_obra).toBeNull();
    expect(res.body.data.comissao_joel).toBeNull();
  });
});
