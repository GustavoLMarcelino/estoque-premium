import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import jwt from 'jsonwebtoken';
import { authAdmin } from './helpers/api.js';
import { normalizarForma } from '../src/utils/formaPagamento.js';

// GET /api/vendas-resumo — resumo das DUAS linhas num payload só.
// O que estes testes protegem não é "a rota responde", é a CONFIANÇA NO NÚMERO:
// paridade entre as linhas, taxa por venda, e o guard de crédito sem parcelas.

const marcaDe = (nome) =>
  prisma.marca.upsert({ where: { nome }, update: {}, create: { nome } });

beforeEach(async () => {
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.marca.deleteMany();
});

/* ===================== E. normalizador ===================== */

describe('normalizarForma — todas as grafias das duas linhas', () => {
  it.each([
    ['Crédito à vista', 'credito'],
    ['Crédito 10x', 'credito'],
    ['Crédito 2x', 'credito'],
    ['Crédito parcelado', 'credito'], // grafia histórica, pré-Fase 0
    ['credito', 'credito'],           // chave de Baterias
    ['PIX', 'pix'],
    ['pix', 'pix'],
    ['Débito', 'debito'],
    ['debito', 'debito'],
    ['Dinheiro', 'dinheiro'],
    ['', null],
    [null, null],
    [undefined, null],
    ['xpto', null],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarForma(entrada)).toBe(esperado);
  });
});

/* ===================== B. não-regressão de Baterias ===================== */

describe('B — /movimentacoes/resumo não regride com o refactor', () => {
  beforeEach(async () => {
    const marca = await marcaDe('Moura');
    const produtoId = (
      await prisma.estoque.create({
        data: {
          produto: 'Bateria 60Ah', modelo: 'BAT-60', marca_id: marca.id,
          custo: '100.00', valor_venda: '200.00', valor_vista: '200.00', valor_parcelado: '230.00',
          qtd_minima: 1, qtd_inicial: 20, entradas: 0, saidas: 0,
        },
      })
    ).id;
    await prisma.movimentacoes.createMany({
      data: [
        { produto_id: produtoId, tipo: 'SAIDA', quantidade: 2, valor_final: '230.00', forma_pagamento: 'credito', parcelas: 10, data_movimentacao: new Date('2026-08-01T12:00:00Z') },
        { produto_id: produtoId, tipo: 'SAIDA', quantidade: 1, valor_final: '200.00', forma_pagamento: 'pix', data_movimentacao: new Date('2026-08-02T12:00:00Z') },
        { produto_id: produtoId, tipo: 'SAIDA', quantidade: 3, valor_final: '210.00', data_movimentacao: new Date('2026-08-02T15:00:00Z') },
        { produto_id: produtoId, tipo: 'ENTRADA', quantidade: 5, valor_final: '0.00', data_movimentacao: new Date('2026-08-01T10:00:00Z') },
      ],
    });
  });

  // Payload CAPTURADO da implementação anterior (antes de extrair o módulo),
  // com este mesmo seed. Se o refactor mudar um centavo, este teste quebra.
  const ESPERADO = {
    vendasBrutas: 1290,
    qtdVendas: 6,
    taxas: 59.62,
    vendasSemForma: { qtd: 1, receita: 630 },
    seriePorDia: [
      { dia: '2026-08-01', receita: 460 },
      { dia: '2026-08-02', receita: 830 },
    ],
    custoVendido: 600,
    lucroBruto: 690,
    lucroLiquido: 630.38,
  };

  it('payload byte a byte igual ao de antes do refactor', async () => {
    const { body } = await request(app).get('/api/movimentacoes/resumo').set(authAdmin());
    expect(body.data).toEqual(ESPERADO);
  });

  it('o bloco baterias de /vendas-resumo é o MESMO payload', async () => {
    const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());
    expect(body.data.baterias).toEqual(ESPERADO);
  });
});

/* ===================== A. paridade entre as linhas ===================== */

describe('A — Baterias e Som com mesma receita/custo/forma/parcelas', () => {
  beforeEach(async () => {
    const marca = await marcaDe('Acdelco');
    // Baterias: 2 × 500 de receita, custo 300/un → receita 1000, custo 600.
    const bat = await prisma.estoque.create({
      data: {
        produto: 'Bateria', modelo: 'B-1', marca_id: marca.id,
        custo: '300.00', valor_venda: '500.00', qtd_minima: 1, qtd_inicial: 10, entradas: 0, saidas: 0,
      },
    });
    await prisma.movimentacoes.create({
      data: {
        produto_id: bat.id, tipo: 'SAIDA', quantidade: 2, valor_final: '500.00',
        forma_pagamento: 'credito', parcelas: 6, data_movimentacao: new Date('2026-08-01T12:00:00Z'),
      },
    });
    // Som: mesmo dinheiro — pedido de 1000, 2 unidades de um produto de custo 300.
    const som = await prisma.estoque_som.create({
      data: {
        produto: 'Central', modelo: 'S-1', marca_id: marca.id,
        custo: '300.00', valor_venda: '500.00', qtd_minima: 1, qtd_inicial: 10, entradas: 0, saidas: 0,
      },
    });
    const pedido = await prisma.pedido_som.create({
      data: {
        valor_total: '1000.00', forma_pagamento: 'Crédito 6x', parcelas: 6,
        created_at: new Date('2026-08-01T12:00:00Z'),
      },
    });
    await prisma.pedido_som_item.create({
      data: {
        pedido_id: pedido.id, tipo: 'PRODUTO', produto_id: som.id, descricao: 'Central',
        quantidade: 2, valor_unit: '500.00', valor_total: '1000.00', baixa_estoque: true,
      },
    });
  });

  it('vendasBrutas, custoVendido, taxas e lucros IDÊNTICOS nas duas linhas', async () => {
    const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());
    const { baterias: b, som: s } = body.data;

    expect(s.vendasBrutas).toBe(b.vendasBrutas);   // 1000
    expect(s.custoVendido).toBe(b.custoVendido);   // 600
    expect(s.taxas).toBe(b.taxas);                 // mesma faixa (2–6x) e mesma receita
    expect(s.lucroBruto).toBe(b.lucroBruto);       // 400
    expect(s.lucroLiquido).toBe(b.lucroLiquido);
    expect(s.qtdVendas).toBe(b.qtdVendas);         // 2 unidades dos dois lados
    expect(b.vendasBrutas).toBe(1000);
    expect(b.custoVendido).toBe(600);
    expect(b.taxas).toBeGreaterThan(0);
  });

  it('total == baterias + som, campo a campo', async () => {
    const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());
    const { total: t, baterias: b, som: s } = body.data;

    expect(t.vendasBrutas).toBe(b.vendasBrutas + s.vendasBrutas);
    expect(t.custoVendido).toBe(b.custoVendido + s.custoVendido);
    expect(t.taxas).toBe(b.taxas + s.taxas);
    expect(t.qtdVendas).toBe(b.qtdVendas + s.qtdVendas);
    expect(t.lucroBruto).toBe(b.lucroBruto + s.lucroBruto);
    expect(t.lucroLiquido).toBe(b.lucroLiquido + s.lucroLiquido);
    // e o total fecha consigo mesmo
    expect(t.lucroBruto).toBe(t.vendasBrutas - t.custoVendido);
    expect(t.lucroLiquido).toBe(+(t.vendasBrutas - t.custoVendido - t.taxas).toFixed(2));
    // mesmo dia nas duas linhas → uma entrada só na série do total
    expect(t.seriePorDia).toEqual([{ dia: '2026-08-01', receita: 2000 }]);
    // campos exclusivos de Som não vazam para o total
    expect(t.qtdPedidos).toBeUndefined();
    expect(t.receitaMaoObra).toBeUndefined();
  });
});

/* ===================== C/D. taxa e o guard de parcelas ===================== */

describe('C/D — taxa de Som por faixa de parcelas e o guard do crédito', () => {
  let produtoSomId;

  beforeEach(async () => {
    const marca = await marcaDe('JBL');
    produtoSomId = (
      await prisma.estoque_som.create({
        data: {
          produto: 'Alto-falante', modelo: 'AF-6', marca_id: marca.id,
          custo: '100.00', valor_venda: '500.00', qtd_minima: 1, qtd_inicial: 20, entradas: 0, saidas: 0,
        },
      })
    ).id;
  });

  const criarPedido = (dados) =>
    prisma.pedido_som.create({
      data: { valor_total: '1000.00', created_at: new Date('2026-08-01T12:00:00Z'), ...dados },
    });

  const somDe = async () => {
    const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());
    return body.data.som;
  };

  it('C — 10x custa MAIS que 2x na mesma receita (faixa + antecipação)', async () => {
    await criarPedido({ forma_pagamento: 'Crédito 2x', parcelas: 2 });
    const em2x = (await somDe()).taxas;

    await prisma.pedido_som.deleteMany();
    await criarPedido({ forma_pagamento: 'Crédito 10x', parcelas: 10 });
    const em10x = (await somDe()).taxas;

    expect(em10x).toBeGreaterThan(em2x);
    expect(em2x).toBeGreaterThan(0);
  });

  // REGRESSÃO CRÍTICA. taxas.js faz Math.trunc(Number(parcelas) || 1), então
  // parcelas null cairia em 1x (≈3,43%, sem antecipação) num pedido que pode
  // ter sido 10x (≈12,75%) — quase 9,3 pontos de erro com cara de exatidão.
  it('D — crédito SEM parcelas (pré-Fase 0) não é taxado: vai para vendasSemForma', async () => {
    await criarPedido({ forma_pagamento: 'Crédito parcelado', parcelas: null });
    const som = await somDe();

    expect(som.taxas).toBe(0);                    // NÃO inventou 1x
    expect(som.vendasSemForma.qtd).toBe(1);
    expect(som.vendasSemForma.receita).toBe(1000);
    expect(som.vendasBrutas).toBe(1000);          // a receita continua contando
  });

  it('D — com parcelas informadas o MESMO pedido passa a ser taxado', async () => {
    await criarPedido({ forma_pagamento: 'Crédito 10x', parcelas: 10 });
    const som = await somDe();

    expect(som.taxas).toBeGreaterThan(100);       // 10x sobre 1000 ≈ 127,50
    expect(som.vendasSemForma.qtd).toBe(0);
  });

  it('D — forma não reconhecida e forma ausente também são sinalizadas', async () => {
    await criarPedido({ forma_pagamento: 'xpto', parcelas: null });
    await criarPedido({ forma_pagamento: null, parcelas: null });
    const som = await somDe();

    expect(som.taxas).toBe(0);
    expect(som.vendasSemForma.qtd).toBe(2);
    expect(som.vendasSemForma.receita).toBe(2000);
  });

  // Mudança de comportamento consciente: o guard vale para AS DUAS LINHAS,
  // porque a conta é compartilhada. O caminho de escrita de Baterias sempre
  // grava parcelas >= 1 no crédito (movimentacoes.routes.js), então isto só
  // alcança linha inserida fora da API. Antes seria taxada como 1x.
  it('D — o guard também protege Baterias (crédito sem parcelas)', async () => {
    const marca = await marcaDe('Moura');
    const bat = await prisma.estoque.create({
      data: { produto: 'Bateria', modelo: 'B', marca_id: marca.id, custo: '100.00', valor_venda: '300.00', qtd_minima: 1, qtd_inicial: 10, entradas: 0, saidas: 0 },
    });
    await prisma.movimentacoes.create({
      data: { produto_id: bat.id, tipo: 'SAIDA', quantidade: 1, valor_final: '300.00', forma_pagamento: 'credito', parcelas: null, data_movimentacao: new Date('2026-08-01T12:00:00Z') },
    });

    const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());
    expect(body.data.baterias.taxas).toBe(0);
    expect(body.data.baterias.vendasSemForma.qtd).toBe(1);
  });

  it('dinheiro é forma INFORMADA com taxa zero (não é "sem forma")', async () => {
    await criarPedido({ forma_pagamento: 'Dinheiro' });
    const som = await somDe();

    expect(som.taxas).toBe(0);
    expect(som.vendasSemForma.qtd).toBe(0);
  });

  it('taxa é somada POR PEDIDO, não sobre o total', async () => {
    await criarPedido({ valor_total: '100.00', forma_pagamento: 'Crédito 10x', parcelas: 10 });
    await criarPedido({ valor_total: '100.00', forma_pagamento: 'Crédito 10x', parcelas: 10 });
    const doisDeCem = (await somDe()).taxas;

    await prisma.pedido_som.deleteMany();
    await criarPedido({ valor_total: '200.00', forma_pagamento: 'Crédito 10x', parcelas: 10 });
    const umDeDuzentos = (await somDe()).taxas;

    // trunc2 por componente em cada venda: os dois caminhos podem diferir em
    // centavos, e o que vale é a soma por pedido.
    expect(doisDeCem).toBeCloseTo(umDeDuzentos, 1);
    expect(doisDeCem).toBeGreaterThan(0);
  });
});

/* ===================== F/G. receita, custo e mão de obra ===================== */

describe('F/G — produtos × mão de obra', () => {
  let produtoId;

  beforeEach(async () => {
    const marca = await marcaDe('Pioneer');
    produtoId = (
      await prisma.estoque_som.create({
        data: {
          produto: 'Módulo', modelo: 'M-1', marca_id: marca.id,
          custo: '200.00', valor_venda: '600.00', qtd_minima: 1, qtd_inicial: 10, entradas: 0, saidas: 0,
        },
      })
    ).id;
  });

  it('F — Σ itens PRODUTO.valor_total == vendasBrutas − receitaMaoObra', async () => {
    const pedido = await prisma.pedido_som.create({
      data: {
        valor_total: '1100.00', valor_mao_obra: '500.00',
        forma_pagamento: 'PIX', created_at: new Date('2026-08-01T12:00:00Z'),
      },
    });
    await prisma.pedido_som_item.createMany({
      data: [
        { pedido_id: pedido.id, tipo: 'PRODUTO', produto_id: produtoId, descricao: 'Módulo', quantidade: 1, valor_unit: '600.00', valor_total: '600.00', baixa_estoque: true },
        { pedido_id: pedido.id, tipo: 'MAO_OBRA', descricao: 'Instalação', quantidade: 1, valor_unit: '0.00', valor_total: '0.00', mao_obra_unit: '500.00', mao_obra_total: '500.00', baixa_estoque: false },
      ],
    });

    const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());
    const som = body.data.som;

    const somaItensProduto = 600;
    expect(som.vendasBrutas - som.receitaMaoObra).toBe(somaItensProduto);
    expect(som.receitaProdutos).toBe(600);
    expect(som.receitaMaoObra).toBe(500);
    expect(som.custoVendido).toBe(200);  // só o produto tem custo
    expect(som.qtdVendas).toBe(1);       // unidades de produto
    expect(som.qtdPedidos).toBe(1);
  });

  it('G — pedido só de serviço: custo 0, receitaProdutos 0, qtdVendas 0, qtdPedidos 1', async () => {
    const pedido = await prisma.pedido_som.create({
      data: {
        valor_total: '380.00', valor_mao_obra: '380.00', valor_mao_obra_insulfilme: '380.00',
        forma_pagamento: 'Débito', created_at: new Date('2026-08-01T12:00:00Z'),
      },
    });
    await prisma.pedido_som_item.create({
      data: { pedido_id: pedido.id, tipo: 'MAO_OBRA', descricao: 'Insulfilme', quantidade: 1, valor_unit: '0.00', valor_total: '0.00', mao_obra_unit: '380.00', mao_obra_total: '380.00', baixa_estoque: false },
    });

    const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());
    const som = body.data.som;

    expect(som.vendasBrutas).toBe(380);
    expect(som.custoVendido).toBe(0);
    expect(som.receitaProdutos).toBe(0);
    expect(som.receitaMaoObra).toBe(380);
    expect(som.qtdVendas).toBe(0);
    expect(som.qtdPedidos).toBe(1);
    // margem de serviço é 100% por construção — o bloco separa as receitas
    // justamente para a tela não ler isso como lucro extraordinário
    expect(som.lucroBruto).toBe(380);
  });
});

/* ===================== H/I. dupla contagem e exclusão ===================== */

describe('H/I — receita sai só de pedido_som', () => {
  let produtoId;

  beforeEach(async () => {
    const marca = await marcaDe('Sony');
    produtoId = (
      await prisma.estoque_som.create({
        data: {
          produto: 'Falante', modelo: 'F-1', marca_id: marca.id,
          custo: '50.00', valor_venda: '150.00', qtd_minima: 1, qtd_inicial: 20, entradas: 0, saidas: 0,
        },
      })
    ).id;
  });

  it('H — saída manual (motivo null) fica fora do faturamento e é sinalizada', async () => {
    await prisma.movimentacoes_som.create({
      data: { produto_id: produtoId, tipo: 'SAIDA', quantidade: 4, valor_final: '150.00', data_movimentacao: new Date('2026-08-01T12:00:00Z') },
    });

    const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());
    const som = body.data.som;

    expect(som.vendasBrutas).toBe(0);            // não vira receita fantasma
    expect(som.saidasSemPedido.movimentacoes).toBe(1);
    expect(som.saidasSemPedido.unidades).toBe(4);
  });

  it('H — pedido conta UMA vez, mesmo gerando movimentacoes_som', async () => {
    const res = await request(app).post('/api/pedido-som').set(authAdmin()).send({
      forma_pagamento: 'PIX',
      itens: [{ tipo: 'PRODUTO', produto_id: produtoId, quantidade: 2, valor_unit: 150 }],
    });
    expect(res.status).toBe(201);
    // o pedido gerou a movimentação de baixa
    expect(await prisma.movimentacoes_som.count()).toBe(1);

    const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());
    const som = body.data.som;

    expect(som.vendasBrutas).toBe(300);          // 2 × 150, uma vez só
    expect(som.custoVendido).toBe(100);          // 2 × 50
    expect(som.saidasSemPedido.movimentacoes).toBe(0); // a do pedido tem motivo
  });

  it('I — pedido excluído some de tudo', async () => {
    const res = await request(app).post('/api/pedido-som').set(authAdmin()).send({
      forma_pagamento: 'PIX',
      itens: [{ tipo: 'PRODUTO', produto_id: produtoId, quantidade: 2, valor_unit: 150 }],
    });
    await request(app).delete(`/api/pedido-som/${res.body.data.id}`).set(authAdmin());

    const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());
    const som = body.data.som;

    expect(som.vendasBrutas).toBe(0);
    expect(som.custoVendido).toBe(0);
    expect(som.taxas).toBe(0);
    expect(som.qtdPedidos).toBe(0);
    expect(som.seriePorDia).toEqual([]);
    expect(som.saidasSemPedido.movimentacoes).toBe(0);
  });
});

/* ===================== J/K. escopo e permissão ===================== */

describe('J/K — escopo de linha e gate de custo', () => {
  beforeEach(async () => {
    const marca = await marcaDe('Mix');
    const bat = await prisma.estoque.create({
      data: { produto: 'Bateria', modelo: 'B', marca_id: marca.id, custo: '100.00', valor_venda: '300.00', qtd_minima: 1, qtd_inicial: 10, entradas: 0, saidas: 0 },
    });
    await prisma.movimentacoes.create({
      data: { produto_id: bat.id, tipo: 'SAIDA', quantidade: 1, valor_final: '300.00', forma_pagamento: 'pix', data_movimentacao: new Date('2026-08-01T12:00:00Z') },
    });
    await prisma.pedido_som.create({
      data: { valor_total: '500.00', forma_pagamento: 'PIX', created_at: new Date('2026-08-01T12:00:00Z') },
    });
  });

  /** Usuário com permissões sob medida (dashboards + linhas + ver_custo). */
  async function usuarioCom(permissoes) {
    const email = `escopo-${Math.random().toString(36).slice(2)}@teste.local`;
    const u = await prisma.user.create({
      data: { name: 'Escopo', email, password: 'x', role: 'user', permissoes: JSON.stringify(permissoes) },
    });
    // requireAuth resolve o usuário FRESCO do banco pelo id do token.
    const token = jwt.sign({ id: u.id, email, role: 'user' }, process.env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '1h',
    });
    return { Authorization: `Bearer ${token}` };
  }

  it('J — som-only: baterias null e total == som', async () => {
    const auth = await usuarioCom({ dashboards: true, linha_som: true, ver_custo: true });
    const { body } = await request(app).get('/api/vendas-resumo').set(auth);

    expect(body.data.baterias).toBeNull();
    expect(body.data.som.vendasBrutas).toBe(500);
    expect(body.data.total.vendasBrutas).toBe(500); // Baterias não entra no total
  });

  it('J — baterias-only: som null e total == baterias', async () => {
    const auth = await usuarioCom({ dashboards: true, linha_baterias: true, ver_custo: true });
    const { body } = await request(app).get('/api/vendas-resumo').set(auth);

    expect(body.data.som).toBeNull();
    expect(body.data.baterias.vendasBrutas).toBe(300);
    expect(body.data.total.vendasBrutas).toBe(300);
  });

  it('J — admin vê as duas linhas somadas', async () => {
    const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());

    expect(body.data.baterias.vendasBrutas).toBe(300);
    expect(body.data.som.vendasBrutas).toBe(500);
    expect(body.data.total.vendasBrutas).toBe(800);
  });

  it('K — sem ver_custo: custo e lucro ausentes nos TRÊS blocos', async () => {
    const auth = await usuarioCom({ dashboards: true, linha_baterias: true, linha_som: true });
    const { body } = await request(app).get('/api/vendas-resumo').set(auth);

    for (const bloco of [body.data.total, body.data.baterias, body.data.som]) {
      expect(bloco.custoVendido).toBeUndefined();
      expect(bloco.lucroBruto).toBeUndefined();
      expect(bloco.lucroLiquido).toBeUndefined();
      // faturamento e taxa seguem visíveis
      expect(bloco.vendasBrutas).toBeGreaterThan(0);
      expect(bloco.taxas).toBeGreaterThanOrEqual(0);
    }
  });
});
