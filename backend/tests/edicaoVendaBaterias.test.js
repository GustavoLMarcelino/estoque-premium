import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

// PUT /api/movimentacoes/:id — edição de VENDA de Baterias (Fase D da linha).
//
// Uma venda de Baterias é UMA linha: sem itens, sem total derivado. O que estes
// testes protegem é o que sobra de risco: a ORDEM (estorna antes de validar), o
// rollback total quando o estoque não cabe, a não-reprecificação, a preservação
// da data (que decide a quinzena da comissão) e — inédito no projeto — a troca
// de VENDEDOR, que move dinheiro de uma pessoa para outra.

let marcaId;
let prodA;
let prodB;

const criarProduto = (nome, { qtd_inicial = 50, saidas = 0, entradas = 0, valor_venda = 300 } = {}) =>
  prisma.estoque.create({
    data: {
      produto: nome, modelo: `${nome}-M`, marca_id: marcaId,
      custo: '100.00', valor_venda: String(valor_venda), qtd_minima: 1,
      qtd_inicial, entradas, saidas,
    },
  });

const criarVenda = (dados = {}) =>
  prisma.movimentacoes.create({
    data: {
      produto_id: prodA.id, tipo: 'SAIDA', quantidade: 2, valor_final: '300.00',
      vendedor: 'Ismael', forma_pagamento: 'pix',
      data_movimentacao: new Date('2026-08-10T12:00:00Z'),
      user_id: 1, created_by: 'admin@teste.local',
      ...dados,
    },
  });

const editar = (id, body, auth = authAdmin) =>
  request(app).put(`/api/movimentacoes/${id}`).set(auth()).send(body);

const saidasDe = async (id) => Number((await prisma.estoque.findUnique({ where: { id } })).saidas);

beforeEach(async () => {
  await prisma.venda_auditoria.deleteMany();
  await prisma.comissao_periodo_item.deleteMany();
  await prisma.comissao_periodo.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.garantias.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.marca.deleteMany();
  marcaId = (await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } })).id;
  // A: 50 iniciais, 2 já baixadas pela venda-fixture. B: 4 em estoque.
  prodA = await criarProduto('Bateria A', { qtd_inicial: 50, saidas: 2 });
  prodB = await criarProduto('Bateria B', { qtd_inicial: 4 });
});

/* ─────────────────────────── invariância ─────────────────────────── */

describe('invariância', () => {
  it('editar só a forma não mexe em estoque nem na quantidade', async () => {
    const mov = await criarVenda();

    const { status, body } = await editar(mov.id, { forma_pagamento: 'dinheiro' });
    expect(status).toBe(200);
    expect(body.data.forma_pagamento).toBe('dinheiro');
    expect(body.data.quantidade).toBe(2);
    expect(await saidasDe(prodA.id)).toBe(2); // estornou 2 e reaplicou 2
  });

  it('trocar crédito por PIX zera as parcelas', async () => {
    const mov = await criarVenda({ forma_pagamento: 'credito', parcelas: 10 });

    const { body } = await editar(mov.id, { forma_pagamento: 'pix' });
    expect(body.data.parcelas).toBeNull();
  });

  it('manter crédito preserva as parcelas quando não vêm no payload', async () => {
    const mov = await criarVenda({ forma_pagamento: 'credito', parcelas: 6 });

    const { body } = await editar(mov.id, { valor_final: 280 });
    expect(body.data.parcelas).toBe(6);
  });
});

/* ─────────────────────────── estoque ─────────────────────────── */

describe('estoque: estorna, valida, aplica', () => {
  it('a validação roda SOBRE O SALDO ESTORNADO: 2 → 3 num produto zerado passa', async () => {
    // 2 iniciais, as 2 desta venda já baixadas → em_estoque 0.
    const zerado = await criarProduto('Zerado', { qtd_inicial: 2, saidas: 2 });
    const mov = await criarVenda({ produto_id: zerado.id, quantidade: 2 });

    // Validar ANTES do estorno daria 409 indevido: em_estoque é 0.
    const { status, body } = await editar(mov.id, { quantidade: 3, valor_final: 300 });
    expect(status).toBe(409); // 3 > 2 disponíveis mesmo depois do estorno
    expect(body.message).toMatch(/insuficiente/i);

    // Já 2 → 2 (ou menos) tem que passar, e é o que provaria a ordem:
    const ok = await editar(mov.id, { quantidade: 2, valor_final: 300 });
    expect(ok.status).toBe(200);
    expect(await saidasDe(zerado.id)).toBe(2);
  });

  it('subir a quantidade usa o saldo devolvido pelo próprio estorno', async () => {
    // 3 em estoque + as 2 desta venda que voltam = 5 possíveis.
    const p = await criarProduto('Justo', { qtd_inicial: 5, saidas: 2 });
    const mov = await criarVenda({ produto_id: p.id, quantidade: 2 });

    const { status } = await editar(mov.id, { quantidade: 5, valor_final: 300 });
    expect(status).toBe(200);
    expect(await saidasDe(p.id)).toBe(5);
  });

  it('trocar de produto: A recebe o estorno e B recebe a baixa', async () => {
    const mov = await criarVenda(); // 2 un. em A

    const { status } = await editar(mov.id, { produto_id: prodB.id, valor_final: 300 });
    expect(status).toBe(200);
    expect(await saidasDe(prodA.id)).toBe(0);
    expect(await saidasDe(prodB.id)).toBe(2);
    expect((await prisma.movimentacoes.findUnique({ where: { id: mov.id } })).produto_id).toBe(prodB.id);
  });

  it('estoque insuficiente no produto novo: 409 e ROLLBACK TOTAL nos dois', async () => {
    const mov = await criarVenda(); // 2 un. em A; B tem só 4

    const { status } = await editar(mov.id, { produto_id: prodB.id, quantidade: 5, valor_final: 300 });
    expect(status).toBe(409);

    // nem o estorno de A nem a baixa de B ficaram
    expect(await saidasDe(prodA.id)).toBe(2);
    expect(await saidasDe(prodB.id)).toBe(0);
    const depois = await prisma.movimentacoes.findUnique({ where: { id: mov.id } });
    expect(depois.produto_id).toBe(prodA.id);
    expect(depois.quantidade).toBe(2);
  });

  it('estorno que não cabe (dados já inconsistentes): 409, nada alterado', async () => {
    const p = await criarProduto('Inconsistente', { qtd_inicial: 10, saidas: 1 });
    const mov = await criarVenda({ produto_id: p.id, quantidade: 5 }); // estornar 5 de saidas=1

    const { status, body } = await editar(mov.id, { quantidade: 2, valor_final: 300 });
    expect(status).toBe(409);
    expect(body.message).toMatch(/inconsistente/i);
    expect(await saidasDe(p.id)).toBe(1);
  });
});

/* ─────────────────────────── bloqueios ─────────────────────────── */

describe('bloqueios', () => {
  it('empréstimo de garantia: 409', async () => {
    const g = await prisma.garantias.create({
      data: {
        cliente_nome: 'F', cliente_documento: '1', cliente_telefone: '1', cliente_endereco: 'R',
        produto_codigo: 'A', produto_descricao: 'Bateria A',
      },
    });
    const mov = await criarVenda({ garantia_id: g.id, valor_final: '0.00', vendedor: null });

    const { status, body } = await editar(mov.id, { quantidade: 1, valor_final: 0 });
    expect(status).toBe(409);
    expect(body.message).toMatch(/empréstimo/i);
    expect(await saidasDe(prodA.id)).toBe(2);
  });

  it('ENTRADA: 409 — só venda é editável', async () => {
    const mov = await criarVenda({ tipo: 'ENTRADA', vendedor: null, forma_pagamento: null });

    const { status, body } = await editar(mov.id, { quantidade: 5, valor_final: 100 });
    expect(status).toBe(409);
    expect(body.message).toMatch(/saída|entrada/i);
  });

  it('movimentação inexistente: 404', async () => {
    expect((await editar(999999, { forma_pagamento: 'pix' })).status).toBe(404);
  });

  it('não-admin: 403', async () => {
    const mov = await criarVenda();
    const { status } = await editar(mov.id, { forma_pagamento: 'pix' }, authUser);
    expect(status).toBe(403);
  });
});

/* ─────────────────── .strict(): campo proibido falha alto ─────────────────── */

describe('campos proibidos', () => {
  it.each([
    ['data_movimentacao', { data_movimentacao: '2026-01-01T00:00:00Z' }],
    ['tipo', { tipo: 'ENTRADA' }],
    ['garantia_id', { garantia_id: 5 }],
    ['motivo', { motivo: 'qualquer' }],
    ['user_id', { user_id: 2 }],
    ['created_by', { created_by: 'outro@teste.local' }],
  ])('%s no body devolve 400 nomeando o campo', async (campo, body) => {
    const mov = await criarVenda();
    const res = await editar(mov.id, body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(new RegExp(campo));
  });

  it('vendedor fora do enum: 400 (apurar casa por igualdade exata)', async () => {
    const mov = await criarVenda();
    // "ismael" minúsculo sairia da comissão sem erro nenhum se passasse.
    const res = await editar(mov.id, { vendedor: 'ismael' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/vendedor/);
  });
});

/* ─────────────────────────── preservação ─────────────────────────── */

describe('o que a edição NÃO pode tocar', () => {
  it('id, data, autoria e motivo saem idênticos', async () => {
    const mov = await criarVenda({ motivo: 'Venda balcão' });

    await editar(mov.id, { quantidade: 1, valor_final: 250, vendedor: 'Gustavo', forma_pagamento: 'debito' });

    const depois = await prisma.movimentacoes.findUnique({ where: { id: mov.id } });
    expect(depois.id).toBe(mov.id);
    expect(depois.data_movimentacao.toISOString()).toBe(mov.data_movimentacao.toISOString());
    expect(depois.user_id).toBe(mov.user_id);
    expect(depois.created_by).toBe(mov.created_by);
    expect(depois.motivo).toBe('Venda balcão');
    expect(depois.tipo).toBe('SAIDA');
  });
});

/* ─────────────────────────── não reprecifica ─────────────────────────── */

describe('preço vem da tela, nunca do catálogo', () => {
  it('mudar quantidade sem valor_final: 400', async () => {
    const mov = await criarVenda();
    const { status, body } = await editar(mov.id, { quantidade: 3 });
    expect(status).toBe(400);
    expect(body.message).toMatch(/valor unitário/i);
  });

  it('trocar produto sem valor_final: 400', async () => {
    const mov = await criarVenda();
    expect((await editar(mov.id, { produto_id: prodB.id })).status).toBe(400);
  });

  it('grava o valor enviado mesmo com o catálogo em outro preço', async () => {
    // o produto vale 300 na tabela; a venda foi feita a 250 e assim continua
    const mov = await criarVenda({ valor_final: '250.00' });

    const { body } = await editar(mov.id, { quantidade: 3, valor_final: 250 });
    expect(Number(body.data.valor_final)).toBe(250);
    expect(Number((await prisma.estoque.findUnique({ where: { id: prodA.id } })).valor_venda)).toBe(300);
  });

  it('editar só a forma não exige valor_final', async () => {
    const mov = await criarVenda();
    expect((await editar(mov.id, { forma_pagamento: 'debito' })).status).toBe(200);
  });
});

/* ─────────────────────────── comissão ─────────────────────────── */

const comissaoDe = async (vendedor) => {
  const { body } = await request(app).get('/api/comissao/painel').set(authAdmin());
  const item = body.data.vendedores.find((v) => v.vendedor === vendedor);
  return { qtd: item.qtd_baterias, valor: item.valor_comissao };
};

describe('comissão de vendedor', () => {
  // A comissão de Baterias é R$ fixos por unidade, por vendedor, no período da
  // data_movimentacao. Estas vendas ficam no período CORRENTE (ainda aberto),
  // então /api/comissao as apura ao vivo.
  const agora = () => new Date();

  it('editar só forma/valor não mexe na comissão de ninguém', async () => {
    const mov = await criarVenda({ data_movimentacao: agora() });
    const antes = await comissaoDe('Ismael');

    await editar(mov.id, { forma_pagamento: 'debito', valor_final: 999 });

    expect(await comissaoDe('Ismael')).toEqual(antes);
  });

  it('mudar a quantidade muda a comissão em Δqtd × valor_bateria', async () => {
    const mov = await criarVenda({ data_movimentacao: agora() }); // 2 un.
    const antes = await comissaoDe('Ismael');

    await editar(mov.id, { quantidade: 5, valor_final: 300 });

    const depois = await comissaoDe('Ismael');
    expect(depois.qtd).toBe(antes.qtd + 3);
    const cfg = await prisma.comissao_config.findFirst({ orderBy: { id: 'asc' } });
    expect(depois.valor).toBeCloseTo(antes.valor + 3 * Number(cfg.valor_bateria), 2);
  });

  it('trocar o vendedor migra a comissão inteira de um para o outro', async () => {
    const p = await criarProduto('Migra', { qtd_inicial: 20, saidas: 4 });
    const mov = await criarVenda({ produto_id: p.id, data_movimentacao: agora(), quantidade: 4 });
    const ismaelAntes = await comissaoDe('Ismael');
    const gustavoAntes = await comissaoDe('Gustavo');

    const { status } = await editar(mov.id, { vendedor: 'Gustavo' });
    expect(status).toBe(200);

    const ismaelDepois = await comissaoDe('Ismael');
    const gustavoDepois = await comissaoDe('Gustavo');
    expect(ismaelDepois.qtd).toBe(ismaelAntes.qtd - 4);
    expect(gustavoDepois.qtd).toBe(gustavoAntes.qtd + 4);
    // o total dos dois não muda: é migração, não criação de comissão
    expect(ismaelDepois.valor + gustavoDepois.valor)
      .toBeCloseTo(ismaelAntes.valor + gustavoAntes.valor, 2);
  });
});

describe('quinzena fechada', () => {
  it('a edição passa e o snapshot pago fica INTACTO', async () => {
    // venda de uma quinzena antiga, com o período já fechado e pago
    const p = await criarProduto('Julho', { qtd_inicial: 20, saidas: 4 });
    const mov = await criarVenda({
      produto_id: p.id, data_movimentacao: new Date('2026-07-20T12:00:00Z'), quantidade: 4,
    });
    const periodo = await prisma.comissao_periodo.create({
      data: {
        data_inicio: new Date('2026-07-16T03:00:00Z'),
        data_fim: new Date('2026-08-01T02:59:59Z'),
        itens: {
          create: [{
            vendedor: 'Ismael', qtd_baterias: 4, valor_comissao: '60.00',
            snap_valor_bateria: '15.00', snap_percentual: '30.00', snap_percentual_insulfilme: '25.00',
          }],
        },
      },
      include: { itens: true },
    });

    // troca de vendedor numa venda já paga: permitido, não recalcula
    const { status } = await editar(mov.id, { vendedor: 'Gustavo' });
    expect(status).toBe(200);

    const itens = await prisma.comissao_periodo_item.findMany({ where: { periodo_id: periodo.id } });
    expect(itens).toHaveLength(1);
    expect(itens[0].vendedor).toBe('Ismael');
    expect(Number(itens[0].valor_comissao)).toBe(60);
    expect(itens[0].qtd_baterias).toBe(4);
  });

  it('a listagem marca periodo_fechado para o admin', async () => {
    await criarVenda({ data_movimentacao: new Date('2026-07-20T12:00:00Z') });
    await prisma.comissao_periodo.create({
      data: { data_inicio: new Date('2026-07-16T03:00:00Z'), data_fim: new Date('2026-08-01T02:59:59Z') },
    });

    const { body } = await request(app).get('/api/movimentacoes').set(authAdmin());
    expect(body.data[0].periodo_fechado).toBe(true);
  });

  it('venda de período ainda aberto não é marcada', async () => {
    await criarVenda({ data_movimentacao: new Date() });
    const { body } = await request(app).get('/api/movimentacoes').set(authAdmin());
    expect(body.data[0].periodo_fechado).toBe(false);
  });
});

/* ─────────────────────────── auditoria ─────────────────────────── */

describe('auditoria', () => {
  it('grava UMA linha EDICAO com o estado anterior', async () => {
    const mov = await criarVenda();

    await editar(mov.id, { quantidade: 1, valor_final: 250, vendedor: 'Gustavo' });

    const logs = await prisma.venda_auditoria.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      linha: 'baterias', entidade: 'movimentacoes', entidade_id: mov.id, acao: 'EDICAO',
    });
    const snap = JSON.parse(logs[0].conteudo_anterior);
    expect(snap.movimentacao.quantidade).toBe(2);        // o valor ANTES
    expect(snap.movimentacao.vendedor).toBe('Ismael');
    expect(snap.produto.produto).toBe('Bateria A');
  });

  it('ROLLBACK leva a auditoria junto: 0 linhas', async () => {
    const mov = await criarVenda();

    const { status } = await editar(mov.id, { produto_id: prodB.id, quantidade: 99, valor_final: 300 });
    expect(status).toBe(409);

    expect(await prisma.venda_auditoria.count()).toBe(0);
  });

  it('duas edições geram duas linhas', async () => {
    const mov = await criarVenda();
    await editar(mov.id, { forma_pagamento: 'debito' });
    await editar(mov.id, { forma_pagamento: 'pix' });
    expect(await prisma.venda_auditoria.count()).toBe(2);
  });
});

/* ─────────────── quitação de fiado: o atalho sem estorno ─────────────── */

// Marcar uma venda como paga não move uma unidade de estoque. O PUT normal
// estorna a baixa e reaplica — dois writes inúteis e, pior, um 409 possível se
// o agregado do produto estiver inconsistente: o registro de um pagamento REAL
// falharia por causa de estoque. O atalho existe para isso.
describe('PUT — quitar fiado (atalho de pagamento)', () => {
  // Com nome por padrão: todo fiado criado pela API tem um (o schema exige).
  // O fiado SEM nome é o caso legado — tem fixture própria mais abaixo.
  const fiado = (dados = {}) =>
    criarVenda({
      status_pagamento: 'FIADO', forma_pagamento: null, cliente_fiado: 'Maria Silva', ...dados,
    });

  const lerMov = (id) => prisma.movimentacoes.findUnique({ where: { id } });

  it('quitar grava PAGO e carimba a data do pagamento', async () => {
    const mov = await fiado();
    const antes = Date.now();

    const res = await editar(mov.id, { status_pagamento: 'PAGO' });
    expect(res.status).toBe(200);

    const depois = await lerMov(mov.id);
    expect(depois.status_pagamento).toBe('PAGO');
    expect(depois.data_pagamento).not.toBeNull();
    expect(new Date(depois.data_pagamento).getTime()).toBeGreaterThanOrEqual(antes - 1000);
  });

  it('⭐ quitar NÃO mexe em estoque — é o ponto do atalho', async () => {
    const mov = await fiado({ quantidade: 4 });
    await prisma.estoque.update({ where: { id: prodA.id }, data: { saidas: 4 } });

    const res = await editar(mov.id, { status_pagamento: 'PAGO' });
    expect(res.status).toBe(200);

    // Nem estorno, nem reaplicação: o agregado fica exatamente onde estava.
    expect(await saidasDe(prodA.id)).toBe(4);
    expect((await lerMov(mov.id)).quantidade).toBe(4);
  });

  it('⭐ quita mesmo com o agregado inconsistente (o 409 que o atalho evita)', async () => {
    // saidas menor que a quantidade da venda: o estorno do fluxo normal
    // reprovaria com 409 e o pagamento não seria registrado.
    const mov = await fiado({ quantidade: 5 });
    await prisma.estoque.update({ where: { id: prodA.id }, data: { saidas: 1 } });

    const res = await editar(mov.id, { status_pagamento: 'PAGO' });
    expect(res.status).toBe(200);
    expect((await lerMov(mov.id)).status_pagamento).toBe('PAGO');
    expect(await saidasDe(prodA.id)).toBe(1); // intocado
  });

  it('data_pagamento informada é respeitada ("pagou ontem, registro hoje")', async () => {
    const mov = await fiado();
    const ontem = new Date('2026-08-09T15:30:00Z');

    await editar(mov.id, { status_pagamento: 'PAGO', data_pagamento: ontem.toISOString() });

    const depois = await lerMov(mov.id);
    expect(new Date(depois.data_pagamento).toISOString()).toBe(ontem.toISOString());
  });

  it('voltar para FIADO limpa a data (não sobra pagamento desfeito)', async () => {
    const mov = await fiado();
    await editar(mov.id, { status_pagamento: 'PAGO' });
    expect((await lerMov(mov.id)).data_pagamento).not.toBeNull();

    await editar(mov.id, { status_pagamento: 'FIADO' });
    const depois = await lerMov(mov.id);
    expect(depois.status_pagamento).toBe('FIADO');
    expect(depois.data_pagamento).toBeNull();
  });

  it('o atalho registra no diário como qualquer edição de venda', async () => {
    const mov = await fiado();
    await editar(mov.id, { status_pagamento: 'PAGO' });

    const linhas = await prisma.venda_auditoria.findMany();
    expect(linhas).toHaveLength(1);
    expect(linhas[0].acao).toBe('EDICAO');
    expect(linhas[0].entidade_id).toBe(mov.id);
    // O snapshot guarda o estado ANTERIOR: em aberto.
    expect(JSON.parse(linhas[0].conteudo_anterior).movimentacao.status_pagamento).toBe('FIADO');
  });

  it('quitar junto de uma edição de verdade segue o fluxo normal (com estorno)', async () => {
    const mov = await fiado({ quantidade: 2 });
    await prisma.estoque.update({ where: { id: prodA.id }, data: { saidas: 2 } });

    const res = await editar(mov.id, { quantidade: 3, valor_final: 300, status_pagamento: 'PAGO' });
    expect(res.status).toBe(200);

    // Estoque reaplicado com a quantidade nova E pagamento gravado.
    expect(await saidasDe(prodA.id)).toBe(3);
    const depois = await lerMov(mov.id);
    expect(depois.quantidade).toBe(3);
    expect(depois.status_pagamento).toBe('PAGO');
    expect(depois.data_pagamento).not.toBeNull();
  });

  it('empréstimo de garantia recusa a quitação com a MESMA mensagem', async () => {
    // O atalho passa depois das travas: quitar um empréstimo não faz sentido.
    const garantia = await prisma.garantias.create({
      data: {
        cliente_nome: 'C', cliente_documento: '0', cliente_telefone: '0',
        cliente_endereco: 'R', produto_codigo: 'A-M', produto_descricao: 'A',
        estoque_id: prodA.id, status: 'EM_LOJA',
      },
    });
    const mov = await criarVenda({ garantia_id: garantia.id, status_pagamento: 'FIADO' });

    const res = await editar(mov.id, { status_pagamento: 'PAGO' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/empréstimo de garantia/i);
  });

  it('FIADO com data_pagamento no mesmo payload → 400 (contradição)', async () => {
    const mov = await fiado();
    const res = await editar(mov.id, {
      status_pagamento: 'FIADO', data_pagamento: new Date().toISOString(),
    });
    expect(res.status).toBe(400);
    expect((await lerMov(mov.id)).data_pagamento).toBeNull();
  });

  it('não-admin não quita (mesma régua do resto da edição)', async () => {
    const mov = await fiado();
    const res = await editar(mov.id, { status_pagamento: 'PAGO' }, authUser);
    expect(res.status).toBe(403);
    expect((await lerMov(mov.id)).status_pagamento).toBe('FIADO');
  });

  it('quitar NÃO apaga o nome de quem devia (é o histórico do que aconteceu)', async () => {
    const mov = await fiado();
    await editar(mov.id, { status_pagamento: 'PAGO' });
    expect((await lerMov(mov.id)).cliente_fiado).toBe('Maria Silva');
  });
});

/* ───────────────────── PUT — cliente_fiado ───────────────────── */

describe('PUT — cliente_fiado', () => {
  const lerMov = (id) => prisma.movimentacoes.findUnique({ where: { id } });

  // Fiado LEGADO: lançado antes da coluna existir, então sem nome. É o único
  // jeito de a base ter um fiado anônimo — pela API não passa mais.
  const fiadoLegado = (dados = {}) =>
    criarVenda({ status_pagamento: 'FIADO', forma_pagamento: null, cliente_fiado: null, ...dados });

  const fiadoComNome = (dados = {}) =>
    criarVenda({
      status_pagamento: 'FIADO', forma_pagamento: null, cliente_fiado: 'Maria Silva', ...dados,
    });

  it('corrigir só o nome → 200, sem tocar em estoque (entra no atalho)', async () => {
    const mov = await fiadoComNome({ quantidade: 2 });
    await prisma.estoque.update({ where: { id: prodA.id }, data: { saidas: 2 } });

    const res = await editar(mov.id, { cliente_fiado: 'Maria Silva da Costa' });
    expect(res.status).toBe(200);
    expect((await lerMov(mov.id)).cliente_fiado).toBe('Maria Silva da Costa');
    expect(await saidasDe(prodA.id)).toBe(2);
  });

  it('⭐ corrigir só o nome funciona mesmo com o agregado inconsistente', async () => {
    // Prova que cliente_fiado entrou em CAMPOS_PAGAMENTO: sem isso, o fluxo
    // normal estornaria e o 409 impediria uma correção de digitação.
    const mov = await fiadoComNome({ quantidade: 5 });
    await prisma.estoque.update({ where: { id: prodA.id }, data: { saidas: 1 } });

    const res = await editar(mov.id, { cliente_fiado: 'Outro Nome' });
    expect(res.status).toBe(200);
    expect(await saidasDe(prodA.id)).toBe(1);
  });

  it('⭐ reabrir fiado legado SEM nome → 400 (dívida anônima de novo, não)', async () => {
    const mov = await fiadoLegado();
    await editar(mov.id, { status_pagamento: 'PAGO' }); // quita primeiro

    const res = await editar(mov.id, { status_pagamento: 'FIADO' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/nome do cliente ao marcar como fiado/i);
    // Rollback: continua quitada.
    expect((await lerMov(mov.id)).status_pagamento).toBe('PAGO');
  });

  it('⭐ reabrir fiado que JÁ tem nome passa sem reenviar cliente_fiado', async () => {
    const mov = await fiadoComNome();
    await editar(mov.id, { status_pagamento: 'PAGO' });

    const res = await editar(mov.id, { status_pagamento: 'FIADO' });
    expect(res.status).toBe(200);
    const depois = await lerMov(mov.id);
    expect(depois.status_pagamento).toBe('FIADO');
    expect(depois.cliente_fiado).toBe('Maria Silva');
    expect(depois.data_pagamento).toBeNull();
  });

  it('reabrir legado JUNTO com o nome → 200 (é o caminho de corrigir a lacuna)', async () => {
    const mov = await fiadoLegado();
    await editar(mov.id, { status_pagamento: 'PAGO' });

    const res = await editar(mov.id, { status_pagamento: 'FIADO', cliente_fiado: 'João Souza' });
    expect(res.status).toBe(200);
    const depois = await lerMov(mov.id);
    expect(depois.status_pagamento).toBe('FIADO');
    expect(depois.cliente_fiado).toBe('João Souza');
  });

  it('a trava vale também na edição completa, não só no atalho', async () => {
    const mov = await criarVenda({ quantidade: 2 }); // venda paga, sem nome
    const res = await editar(mov.id, { quantidade: 3, valor_final: 300, status_pagamento: 'FIADO' });
    expect(res.status).toBe(400);
    // Antes da bifurcação: nada de estoque foi tocado.
    expect(await saidasDe(prodA.id)).toBe(2);
    expect((await lerMov(mov.id)).quantidade).toBe(2);
  });

  it('nome com espaços nas pontas é gravado limpo', async () => {
    const mov = await fiadoComNome();
    await editar(mov.id, { cliente_fiado: '  João Souza  ' });
    expect((await lerMov(mov.id)).cliente_fiado).toBe('João Souza');
  });

  it('nome vazio → 400 (não é um jeito de apagar)', async () => {
    const mov = await fiadoComNome();
    const res = await editar(mov.id, { cliente_fiado: '   ' });
    expect(res.status).toBe(400);
    expect((await lerMov(mov.id)).cliente_fiado).toBe('Maria Silva');
  });

  it('acima de 150 caracteres → 400', async () => {
    const mov = await fiadoComNome();
    const res = await editar(mov.id, { cliente_fiado: 'x'.repeat(151) });
    expect(res.status).toBe(400);
    expect((await lerMov(mov.id)).cliente_fiado).toBe('Maria Silva');
  });

  it('editar a venda sem mencionar o campo preserva o nome', async () => {
    const mov = await fiadoComNome({ quantidade: 2 });
    await prisma.estoque.update({ where: { id: prodA.id }, data: { saidas: 2 } });

    const res = await editar(mov.id, { quantidade: 3, valor_final: 300 });
    expect(res.status).toBe(200);
    expect((await lerMov(mov.id)).cliente_fiado).toBe('Maria Silva');
  });
});
