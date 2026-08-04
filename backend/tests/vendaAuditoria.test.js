// Fase B — diário append-only de exclusão de venda.
//
// O log entra DENTRO da transação que exclui, e antes da parte destrutiva. Os
// testes cobrem as duas metades do contrato:
//   • gravou o snapshot certo quando a exclusão dá certo;
//   • NÃO sobrou linha nenhuma quando a exclusão falha no meio (rollback).
//
// A prova de rollback não usa mock: reaproveita um erro REAL de produção — o
// estorno que não cabe no agregado (409 da Fase A), que acontece DEPOIS de o
// log já ter sido gravado dentro da transação.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

let batId;
let somId;

beforeEach(async () => {
  await prisma.venda_auditoria.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.estoque_som.deleteMany();

  const marca = await prisma.marca.upsert({
    where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' },
  });

  batId = (await prisma.estoque.create({
    data: {
      produto: 'Bateria Aud', modelo: 'BA-60', marca_id: marca.id,
      custo: '100.00', valor_venda: '200.00', qtd_minima: 1,
      qtd_inicial: 20, entradas: 0, saidas: 0,
    },
  })).id;

  somId = (await prisma.estoque_som.create({
    data: {
      produto: 'Som Aud', modelo: 'SA-1', marca_id: marca.id,
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
  request(app).post('/api/pedido-som').set(authAdmin()).send({ veiculo: 'Gol', itens, ...extra });

/** Única linha do diário, com o snapshot já desserializado. */
async function unicaAuditoria() {
  const linhas = await prisma.venda_auditoria.findMany();
  expect(linhas).toHaveLength(1);
  return { ...linhas[0], snapshot: JSON.parse(linhas[0].conteudo_anterior) };
}

/* ─────────────────────── registro nas três exclusões ─────────────────────── */

describe('Baterias — exclusão de venda vira linha no diário', () => {
  it('grava acao, entidade, entidade_id, autor e o conteúdo da venda', async () => {
    const mov = (await criarMovBat({
      produto_id: batId, tipo: 'saida', quantidade: 4, valor_final: 250,
      forma_pagamento: 'credito', parcelas: 10, vendedor: 'Ismael',
    })).body;

    expect(await prisma.venda_auditoria.count()).toBe(0); // criar não audita

    const del = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(204);

    const a = await unicaAuditoria();
    expect(a.linha).toBe('baterias');
    expect(a.entidade).toBe('movimentacoes');
    expect(a.entidade_id).toBe(mov.id);
    expect(a.acao).toBe('EXCLUSAO');
    expect(a.feito_por).toBe('admin@teste.local');
    expect(a.user_id).toBe(1);
    expect(a.feito_em).toBeInstanceOf(Date);

    // Snapshot reconstruível: os campos que definem a venda.
    const m = a.snapshot.movimentacao;
    expect(m.id).toBe(mov.id);
    expect(m.tipo).toBe('SAIDA');
    expect(m.quantidade).toBe(4);
    expect(Number(m.valor_final)).toBe(250);
    expect(m.forma_pagamento).toBe('credito');
    expect(m.parcelas).toBe(10);
    expect(m.vendedor).toBe('Ismael');
    expect(m.produto_id).toBe(batId);
    // Produto junto: ele pode ser apagado depois, e o id sozinho não diria nada.
    expect(a.snapshot.produto).toMatchObject({ id: batId, produto: 'Bateria Aud', modelo: 'BA-60' });
  });

  it('a venda some mas o diário permanece (é o ponto)', async () => {
    const mov = (await criarMovBat({
      produto_id: batId, tipo: 'saida', quantidade: 2, valor_final: 200,
    })).body;
    await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());

    expect(await prisma.movimentacoes.count()).toBe(0);
    expect(await prisma.venda_auditoria.count()).toBe(1);
  });

  it('duas exclusões geram duas linhas (append-only)', async () => {
    for (const q of [1, 2]) {
      const mov = (await criarMovBat({
        produto_id: batId, tipo: 'saida', quantidade: q, valor_final: 200,
      })).body;
      await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    }
    const linhas = await prisma.venda_auditoria.findMany({ orderBy: { id: 'asc' } });
    expect(linhas).toHaveLength(2);
    expect(linhas[0].entidade_id).not.toBe(linhas[1].entidade_id);
  });
});

describe('Som — exclusão de pedido grava o pedido INTEIRO', () => {
  it('snapshot inclui cabeçalho, itens e as movimentações vinculadas', async () => {
    const res = await criarPedido(
      [
        { tipo: 'PRODUTO', produto_id: somId, quantidade: 2, valor_unit: 300 },
        { tipo: 'MAO_OBRA', descricao: 'Instalacao', quantidade: 1, valor_unit: 400 },
      ],
      { forma_pagamento: 'Crédito 10x', parcelas: 10 },
    );
    const pedidoId = res.body.data.id;

    const del = await request(app).delete(`/api/pedido-som/${pedidoId}`).set(authAdmin());
    expect(del.status).toBe(204);

    const a = await unicaAuditoria();
    expect(a.linha).toBe('som');
    expect(a.entidade).toBe('pedido_som');
    expect(a.entidade_id).toBe(pedidoId);
    expect(a.acao).toBe('EXCLUSAO');

    // Cabeçalho, com os totais e a comissão que o pedido tinha.
    const p = a.snapshot.pedido;
    expect(p.id).toBe(pedidoId);
    expect(p.veiculo).toBe('Gol');
    expect(Number(p.valor_total)).toBe(1000); // 600 produto + 400 mão de obra
    expect(Number(p.valor_mao_obra)).toBe(400);
    expect(p.forma_pagamento).toBe('Crédito 10x');
    expect(p.parcelas).toBe(10);
    expect(p.comissao_joel).not.toBeUndefined();

    // Itens: dá para reconstruir o que foi vendido.
    expect(a.snapshot.itens).toHaveLength(2);
    const produto = a.snapshot.itens.find((i) => i.tipo === 'PRODUTO');
    expect(produto.produto_id).toBe(somId);
    expect(produto.quantidade).toBe(2);
    expect(Number(produto.valor_unit)).toBe(300);
    expect(produto.baixa_estoque).toBe(true);

    // Baixas de estoque geradas pelo pedido — apagadas junto, salvas aqui.
    expect(a.snapshot.movimentacoes).toHaveLength(1);
    expect(a.snapshot.movimentacoes[0].motivo).toBe(`Pedido Som #${pedidoId}`);
    expect(a.snapshot.movimentacoes[0].quantidade).toBe(2);
  });

  it('pedido só de serviço: itens sem produto, sem movimentação vinculada', async () => {
    const res = await criarPedido([
      { tipo: 'MAO_OBRA', descricao: 'Insulfilme', quantidade: 1, valor_unit: 380 },
    ]);
    await request(app).delete(`/api/pedido-som/${res.body.data.id}`).set(authAdmin());

    const a = await unicaAuditoria();
    expect(a.snapshot.itens).toHaveLength(1);
    expect(a.snapshot.movimentacoes).toHaveLength(0);
    expect(Number(a.snapshot.pedido.valor_total)).toBe(380);
  });
});

describe('Som — exclusão de movimentação avulsa', () => {
  it('grava linha própria, com entidade movimentacoes_som', async () => {
    const mov = (await criarMovSom({ produto_id: somId, tipo: 'saida', quantidade: 3 })).body;
    const del = await request(app).delete(`/api/movimentacoes-som/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(204);

    const a = await unicaAuditoria();
    expect(a.linha).toBe('som');
    expect(a.entidade).toBe('movimentacoes_som');
    expect(a.entidade_id).toBe(mov.id);
    expect(a.snapshot.movimentacao.quantidade).toBe(3);
    expect(a.snapshot.produto.produto).toBe('Som Aud');
  });
});

/* ─────────────────────── ATOMICIDADE (o destaque) ─────────────────────── */

describe('Rollback — exclusão que falha no meio não deixa NADA', () => {
  // O log é gravado ANTES do estorno. Quando o estorno reprova (409 da Fase A),
  // a transação inteira volta atrás: nem a venda é apagada, nem o log fica.
  // Sem atomicidade, sobraria uma linha de auditoria de uma exclusão que
  // nunca aconteceu — pior que não auditar, porque mentiria.

  it('Baterias: estorno que não cabe → 409, sem venda apagada e sem log', async () => {
    const mov = (await criarMovBat({
      produto_id: batId, tipo: 'saida', quantidade: 5, valor_final: 200,
    })).body;
    // Inconsistência forçada: o agregado não comporta o estorno.
    await prisma.estoque.update({ where: { id: batId }, data: { saidas: 2 } });

    const del = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(409);

    expect(await prisma.venda_auditoria.count()).toBe(0); // ← o log sumiu junto
    expect(await prisma.movimentacoes.count()).toBe(1);   // ← a venda continua
    expect((await prisma.estoque.findUnique({ where: { id: batId } })).saidas).toBe(2);
  });

  it('Pedido de Som: estorno que não cabe → 409, sem pedido apagado e sem log', async () => {
    const res = await criarPedido([
      { tipo: 'PRODUTO', produto_id: somId, quantidade: 6, valor_unit: 200 },
    ]);
    await prisma.estoque_som.update({ where: { id: somId }, data: { saidas: 2 } });

    const del = await request(app).delete(`/api/pedido-som/${res.body.data.id}`).set(authAdmin());
    expect(del.status).toBe(409);

    expect(await prisma.venda_auditoria.count()).toBe(0);
    expect(await prisma.pedido_som.count()).toBe(1);
    expect(await prisma.pedido_som_item.count()).toBe(1);
    expect(await prisma.movimentacoes_som.count()).toBe(1);
  });

  it('Som avulsa: estorno que não cabe → 409, sem log', async () => {
    const mov = (await criarMovSom({ produto_id: somId, tipo: 'saida', quantidade: 5 })).body;
    await prisma.estoque_som.update({ where: { id: somId }, data: { saidas: 1 } });

    const del = await request(app).delete(`/api/movimentacoes-som/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(409);
    expect(await prisma.venda_auditoria.count()).toBe(0);
    expect(await prisma.movimentacoes_som.count()).toBe(1);
  });

  it('recusa ANTES do log (empréstimo de garantia) também não grava nada', async () => {
    const garantia = await prisma.garantias.create({
      data: {
        cliente_nome: 'C', cliente_documento: '0', cliente_telefone: '0',
        cliente_endereco: 'R', produto_codigo: 'BA-60', produto_descricao: 'Bateria Aud',
        estoque_id: batId, status: 'EM_LOJA',
      },
    });
    const mov = await prisma.movimentacoes.create({
      data: {
        produto_id: batId, garantia_id: garantia.id, tipo: 'SAIDA',
        quantidade: 1, valor_final: '0.00', data_movimentacao: new Date(),
      },
    });

    const del = await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());
    expect(del.status).toBe(409);
    // Tentativa recusada não é exclusão: o diário registra o que ACONTECEU.
    expect(await prisma.venda_auditoria.count()).toBe(0);
  });
});

/* ─────────────────────── append-only: ninguém mais muda ─────────────────────── */

describe('Append-only — nenhum leitor de venda passa a filtrar', () => {
  it('o diário não entra no faturamento nem na contagem de vendas', async () => {
    const mov = (await criarMovBat({
      produto_id: batId, tipo: 'saida', quantidade: 2, valor_final: 200,
      forma_pagamento: 'pix',
    })).body;
    await request(app).delete(`/api/movimentacoes/${mov.id}`).set(authAdmin());

    const resumo = await request(app).get('/api/vendas-resumo').set(authAdmin());
    expect(resumo.body.data.total.vendasBrutas).toBe(0);
    expect(resumo.body.data.total.qtdVendas).toBe(0);
    // A linha de auditoria existe e não contaminou número nenhum.
    expect(await prisma.venda_auditoria.count()).toBe(1);
  });
});
