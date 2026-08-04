// Fase C — edição de pedido de Som (cabeçalho que NÃO cascateia).
//
// O contrato tem duas metades, e os testes cobrem as duas:
//   • o que a edição DEVE mudar: forma, parcelas, veículo — e, por tabela, a
//     taxa que o /vendas-resumo calcula na leitura;
//   • o que ela NÃO PODE encostar: estoque, itens, movimentações, comissão,
//     data. Esses são a maioria dos testes de propósito — numa edição de venda,
//     o que fica parado importa mais do que o que muda.
//
// A prova de rollback (⭐) não usa mock: reaproveita o 400 real de coerência
// rótulo×parcelas, que dispara DEPOIS de a auditoria já estar gravada dentro da
// transação. Mesma disciplina da Fase B.
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

/** Pedido com 1 produto (baixa estoque) + 1 serviço manual (gera mão de obra). */
async function criarPedido(extra = {}) {
  const res = await request(app).post('/api/pedido-som').set(authAdmin()).send({
    veiculo: 'Gol 2015',
    forma_pagamento: 'PIX',
    itens: [
      { tipo: 'PRODUTO', produto_id: somId, descricao: 'Multimidia', quantidade: 2, valor_unit: 600 },
      { tipo: 'MAO_OBRA', descricao: 'Instalacao', quantidade: 1, valor_unit: 400 },
    ],
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

const editar = (id, body) =>
  request(app).put(`/api/pedido-som/${id}`).set(authAdmin()).send(body);

/** Fotografia do que a Fase C não pode encostar. */
async function fotoIntocaveis(pedidoId) {
  const [produto, itens, movs, pedido] = await Promise.all([
    prisma.estoque_som.findUnique({ where: { id: somId } }),
    prisma.pedido_som_item.findMany({ where: { pedido_id: pedidoId }, orderBy: { id: 'asc' } }),
    prisma.movimentacoes_som.findMany({ orderBy: { id: 'asc' } }),
    prisma.pedido_som.findUnique({ where: { id: pedidoId } }),
  ]);
  return {
    estoque: { entradas: produto.entradas, saidas: produto.saidas },
    itens: JSON.stringify(itens),
    movs: JSON.stringify(movs),
    derivados: {
      valor_total: String(pedido.valor_total),
      valor_mao_obra: String(pedido.valor_mao_obra),
      comissao_joel: String(pedido.comissao_joel),
      created_at: pedido.created_at.toISOString(),
    },
  };
}

const taxasDoResumo = async () => {
  const { body } = await request(app).get('/api/vendas-resumo').set(authAdmin());
  return body.data.som.taxas;
};

const comissaoDoJoel = async () => {
  const { body } = await request(app).get('/api/comissao/painel').set(authAdmin());
  return body.data.vendedores.find((v) => v.vendedor === 'Joel');
};

/* ─────────────────────────── 1–2: o que muda ─────────────────────────── */

describe('Edição grava os campos e a taxa acompanha', () => {
  it('1) PIX → "Crédito 10x" + parcelas 10', async () => {
    const p = await criarPedido();

    const res = await editar(p.id, { forma_pagamento: 'Crédito 10x', parcelas: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.forma_pagamento).toBe('Crédito 10x');
    expect(res.body.data.parcelas).toBe(10);

    const gravado = await prisma.pedido_som.findUnique({ where: { id: p.id } });
    expect(gravado.forma_pagamento).toBe('Crédito 10x');
    expect(gravado.parcelas).toBe(10);
  });

  it('2) a taxa do /vendas-resumo sobe para a faixa de 10x (com antecipação)', async () => {
    const p = await criarPedido();
    const antes = await taxasDoResumo();

    await editar(p.id, { forma_pagamento: 'Crédito 10x', parcelas: 10 });
    const depois = await taxasDoResumo();

    // PIX é intermediação baixa e sem antecipação; 10x soma a faixa 7–12 mais o
    // desconto a valor presente. Nada foi persistido: o número é recalculado na
    // leitura, a partir da forma nova.
    expect(depois).toBeGreaterThan(antes);
  });
});

/* ──────────────────── 3–6: o que NÃO pode se mexer ──────────────────── */

describe('Nada cascateia: estoque, itens, movimentações e comissão', () => {
  it('3-5) estoque_som, pedido_som_item e movimentacoes_som ficam idênticos', async () => {
    const p = await criarPedido();
    const antes = await fotoIntocaveis(p.id);

    await editar(p.id, { forma_pagamento: 'Crédito 6x', parcelas: 6, veiculo: 'Onix 2020' });
    const depois = await fotoIntocaveis(p.id);

    expect(depois.estoque).toEqual(antes.estoque);   // 3
    expect(depois.itens).toBe(antes.itens);          // 4
    expect(depois.movs).toBe(antes.movs);            // 5
    // Os derivados do cabeçalho também não são tocados pela Fase C.
    expect(depois.derivados).toEqual(antes.derivados);
  });

  it('6) a comissão do Joel não muda', async () => {
    const p = await criarPedido();
    const antes = await comissaoDoJoel();

    await editar(p.id, { forma_pagamento: 'Crédito 10x', parcelas: 10 });
    const depois = await comissaoDoJoel();

    expect(depois.valor_comissao).toBe(antes.valor_comissao);
    expect(depois.base_mao_obra).toBe(antes.base_mao_obra);
  });
});

/* ─────────────────────── 7–8: auditoria e rollback ─────────────────────── */

describe('Auditoria da edição', () => {
  it('7) grava UMA linha EDICAO com o conteúdo ANTERIOR', async () => {
    const p = await criarPedido();
    expect(await prisma.venda_auditoria.count()).toBe(0);

    await editar(p.id, { forma_pagamento: 'Crédito 10x', parcelas: 10 });

    const linhas = await prisma.venda_auditoria.findMany();
    expect(linhas).toHaveLength(1);
    const log = linhas[0];
    expect(log.acao).toBe('EDICAO');
    expect(log.entidade).toBe('pedido_som');
    expect(log.entidade_id).toBe(p.id);
    expect(log.linha).toBe('som');
    expect(log.feito_por).toBe('admin@teste.local');
    expect(log.user_id).toBe(1);

    const snap = JSON.parse(log.conteudo_anterior);
    expect(snap.pedido.forma_pagamento).toBe('PIX'); // a forma ANTIGA
    expect(snap.pedido.parcelas).toBeNull();
    expect(snap.itens).toHaveLength(2);              // itens do estado anterior
  });

  // ⭐ DESTAQUE: a auditoria é gravada ANTES do update, então uma falha depois
  // dela tem que levar as duas coisas embora. O erro é real (coerência
  // rótulo×parcelas), não um mock.
  it('8) ROLLBACK: erro depois do log → diário volta a 0 e o pedido segue o antigo', async () => {
    const p = await criarPedido();

    const res = await editar(p.id, { forma_pagamento: 'Crédito 10x', parcelas: 2 });
    expect(res.status).toBe(400);

    expect(await prisma.venda_auditoria.count()).toBe(0); // ← o log sumiu junto
    const depois = await prisma.pedido_som.findUnique({ where: { id: p.id } });
    expect(depois.forma_pagamento).toBe('PIX');           // ← nada foi gravado
    expect(depois.parcelas).toBeNull();
  });
});

/* ──────────────── 9–10: campos proibidos (.strict) ──────────────── */

describe('Campos fora do escopo viram 400 (nada é gravado)', () => {
  it('9) created_at no body → 400 nomeando o campo', async () => {
    const p = await criarPedido();
    const original = (await prisma.pedido_som.findUnique({ where: { id: p.id } })).created_at;

    const res = await editar(p.id, {
      forma_pagamento: 'PIX',
      created_at: new Date('2020-01-01T00:00:00Z').toISOString(),
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/created_at/);

    const depois = await prisma.pedido_som.findUnique({ where: { id: p.id } });
    expect(depois.created_at.toISOString()).toBe(original.toISOString());
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });

  it('10) itens, valor_total e comissao_joel também são recusados', async () => {
    const p = await criarPedido();

    for (const proibido of [
      { itens: [] },
      { valor_total: '1.00' },
      { comissao_joel: '0.00' },
      { valor_mao_obra: '0.00' },
    ]) {
      const res = await editar(p.id, proibido);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Dados inválidos/);
    }

    const depois = await prisma.pedido_som.findUnique({ where: { id: p.id } });
    expect(String(depois.valor_total)).toBe('1600'); // 2×600 + 400, intacto
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });
});

/* ──────────────── 11–14: permissão e regras de parcelas ──────────────── */

describe('Permissão e coerência de parcelas', () => {
  it('11) admin-only: usuário comum toma 403', async () => {
    const p = await criarPedido();

    const res = await request(app)
      .put(`/api/pedido-som/${p.id}`).set(authUser())
      .send({ forma_pagamento: 'PIX' });

    expect(res.status).toBe(403);
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });

  it('12) Crédito → PIX zera parcelas', async () => {
    const p = await criarPedido({ forma_pagamento: 'Crédito 10x', parcelas: 10 });
    expect((await prisma.pedido_som.findUnique({ where: { id: p.id } })).parcelas).toBe(10);

    const res = await editar(p.id, { forma_pagamento: 'PIX' });
    expect(res.status).toBe(200);

    const depois = await prisma.pedido_som.findUnique({ where: { id: p.id } });
    expect(depois.forma_pagamento).toBe('PIX');
    expect(depois.parcelas).toBeNull(); // não sobra parcela em venda não parcelada
  });

  // Ponto de precisão: o POST defaulta 1x porque a tela sempre manda o número.
  // Na edição, assumir 1x numa venda que foi 10x erraria a taxa em ~9 pontos
  // percentuais com cara de número exato.
  it('13) PIX → Crédito SEM parcelas → 400 (não defaulta 1x)', async () => {
    const p = await criarPedido();

    const res = await editar(p.id, { forma_pagamento: 'Crédito' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/parcelas/i);

    const depois = await prisma.pedido_som.findUnique({ where: { id: p.id } });
    expect(depois.forma_pagamento).toBe('PIX'); // nada gravado
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });

  it('14) rótulo incoerente com o nº de parcelas → 400', async () => {
    const p = await criarPedido();

    const res = await editar(p.id, { forma_pagamento: 'Crédito 10x', parcelas: 2 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/não confere/i);
  });
});

/* ──────────────── 15–17: veículo, 404 e quinzena fechada ──────────────── */

describe('Casos restantes', () => {
  it('15) editar só o veículo não mexe em taxa, comissão nem total', async () => {
    const p = await criarPedido();
    const taxaAntes = await taxasDoResumo();
    const joelAntes = await comissaoDoJoel();
    const antes = await fotoIntocaveis(p.id);

    const res = await editar(p.id, { veiculo: 'Palio 2010' });
    expect(res.status).toBe(200);
    expect(res.body.data.veiculo).toBe('Palio 2010');

    expect(await taxasDoResumo()).toBe(taxaAntes);
    expect((await comissaoDoJoel()).valor_comissao).toBe(joelAntes.valor_comissao);
    const depois = await fotoIntocaveis(p.id);
    expect(depois.derivados).toEqual(antes.derivados);
    expect(depois.estoque).toEqual(antes.estoque);
  });

  it('16) pedido inexistente → 404', async () => {
    const res = await editar(999999, { veiculo: 'Fantasma' });
    expect(res.status).toBe(404);
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });

  // Quinzena fechada NÃO bloqueia: nenhum campo editável entra na comissão, e o
  // snapshot já apurado continua exatamente como foi pago.
  it('17) pedido de quinzena fechada: edita a forma e o snapshot fica intacto', async () => {
    const p = await criarPedido();
    // Joga o pedido para uma quinzena passada e fecha o período à mão.
    const antigo = new Date('2026-01-05T12:00:00Z');
    await prisma.pedido_som.update({ where: { id: p.id }, data: { created_at: antigo } });

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

    const res = await editar(p.id, { forma_pagamento: 'Crédito 6x', parcelas: 6 });
    expect(res.status).toBe(200);

    const itensDepois = await prisma.comissao_periodo_item.findMany({
      where: { periodo_id: periodo.id },
    });
    expect(JSON.stringify(itensDepois)).toBe(snapAntes); // apuração paga, intacta
  });
});
