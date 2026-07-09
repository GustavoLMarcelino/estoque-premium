import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';

// em_estoque derivado do produto (mesma conta do backend)
async function emEstoque(id) {
  const p = await prisma.estoque.findUnique({ where: { id } });
  return Number(p.qtd_inicial ?? 0) + Number(p.entradas ?? 0) - Number(p.saidas ?? 0);
}

let marcaId;
let produtoId; // produto vinculável (código = modelo da garantia)

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.garantias.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.marca.deleteMany();
  marcaId = (await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } })).id;
  produtoId = (
    await prisma.estoque.create({
      data: {
        produto: 'Bateria 60Ah', modelo: 'BAT-60', marca_id: marcaId,
        custo: '200.00', valor_venda: '300.00', qtd_minima: 1, qtd_inicial: 10, entradas: 0, saidas: 0,
      },
    })
  ).id;
});

const clienteBase = { nome: 'João Cliente', documento: '123.456.789-09', telefone: '(47) 90000-0000', endereco: 'Rua A, 100' };
const criar = (body, auth = authAdmin()) => request(app).post('/api/garantias').set(auth).send(body);

describe('POST /api/garantias — criação', () => {
  it('cria garantia normal e vincula ao estoque quando o produto casa', async () => {
    const res = await criar({
      cliente: clienteBase,
      produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' },
      garantia: { status: 'AGUARDANDO_ENVIO', descricaoProblema: 'Não segura carga' },
    });
    expect(res.status).toBe(201);
    expect(res.body.cliente_nome).toBe('João Cliente');
    expect(res.body.estoque_id).toBe(produtoId);
    expect(res.body.status).toBe('AGUARDANDO_ENVIO');
  });

  it('status default é AGUARDANDO_ENVIO quando não informado; resultado/laudo persistem', async () => {
    const res = await criar({
      cliente: clienteBase,
      produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' },
      garantia: { resultado: 'NOVA', laudo: 'Bateria substituída pela distribuidora.' },
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('AGUARDANDO_ENVIO');
    expect(res.body.resultado).toBe('NOVA');
    expect(res.body.laudo).toBe('Bateria substituída pela distribuidora.');
  });

  it('produto inexistente no estoque: garantia é criada com estoque_id null (texto livre)', async () => {
    const res = await criar({
      cliente: clienteBase,
      produto: { codigo: 'INEXISTENTE', descricao: 'Produto que não existe' },
    });
    expect(res.status).toBe(201);
    expect(res.body.estoque_id).toBeNull();
  });

  it('dados de cliente incompletos → 400', async () => {
    const res = await criar({ cliente: { nome: 'Só nome' }, produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' } });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/garantias/:id — edição', () => {
  it('atualiza status e dados do cliente', async () => {
    const g = (await criar({ cliente: clienteBase, produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' } })).body;
    const res = await request(app).patch(`/api/garantias/${g.id}`).set(authAdmin())
      .send({ garantia: { status: 'RECOLHIDA' }, cliente: { ...clienteBase, nome: 'João Editado' } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RECOLHIDA');
    expect(res.body.cliente_nome).toBe('João Editado');
  });

  it('garantia inexistente → 404', async () => {
    const res = await request(app).patch('/api/garantias/99999').set(authAdmin()).send({ garantia: { status: 'RECOLHIDA' } });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/garantias/:id/anonimizar — LGPD', () => {
  it('substitui a PII e mantém o registro consultável', async () => {
    const g = (await criar({ cliente: clienteBase, produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' } })).body;
    const anon = await request(app).post(`/api/garantias/${g.id}/anonimizar`).set(authAdmin());
    expect(anon.status).toBe(200);
    for (const campo of ['cliente_nome', 'cliente_documento', 'cliente_telefone', 'cliente_endereco']) {
      expect(anon.body.data[campo]).toBe('ANONIMIZADO');
    }
    // registro continua íntegro e consultável
    const get = await request(app).get(`/api/garantias/${g.id}`).set(authAdmin());
    expect(get.status).toBe(200);
    expect(get.body.cliente_nome).toBe('ANONIMIZADO');
    expect(get.body.produto_descricao).toBe('Bateria 60Ah'); // dado não-PII preservado
  });

  it('anonimizar exige admin (403 para user comum)', async () => {
    const g = (await criar({ cliente: clienteBase, produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' } })).body;
    const res = await request(app).post(`/api/garantias/${g.id}/anonimizar`).set(authUser());
    expect(res.status).toBe(403);
  });

  it('excluir garantia exige admin (403 para user comum)', async () => {
    const g = (await criar({ cliente: clienteBase, produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' } })).body;
    const res = await request(app).delete(`/api/garantias/${g.id}`).set(authUser());
    expect(res.status).toBe(403);
  });
});

describe('Empréstimo e devolução', () => {
  // produto_id = produto REAL selecionado para empréstimo (default = o produtoId base)
  const comEmprestimo = (qtd, produto_id = produtoId) => ({
    cliente: clienteBase,
    produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' },
    emprestimo: { ativo: true, produto_id, quantidade: qtd },
  });

  it('empréstimo dá baixa no PRODUTO SELECIONADO e persiste os campos na garantia', async () => {
    const antes = await emEstoque(produtoId); // 10
    const res = await criar(comEmprestimo(3));
    expect(res.status).toBe(201);
    expect(res.body.emprestimo_produto_id).toBe(produtoId);
    expect(res.body.emprestimo_quantidade).toBe(3);
    expect(res.body.emprestimo_devolvido).toBe(false);
    expect(await emEstoque(produtoId)).toBe(antes - 3); // 7
    // a SAIDA de ida ficou rastreável (garantia_id + motivo)
    const mov = await prisma.movimentacoes.findFirst({ where: { garantia_id: res.body.id, tipo: 'SAIDA' } });
    expect(mov).toBeTruthy();
    expect(mov.quantidade).toBe(3);
    expect(mov.produto_id).toBe(produtoId);
  });

  it('baixa vai no produto emprestado, não no produto em garantia', async () => {
    // produto emprestado é OUTRO item, diferente do produto sob garantia (BAT-60)
    const marcaLocal = (await prisma.marca.findFirst()).id;
    const outro = await prisma.estoque.create({
      data: { produto: 'Bateria Reserva', modelo: 'RES-1', marca_id: marcaLocal, custo: '90', valor_venda: '140', qtd_minima: 1, qtd_inicial: 4, entradas: 0, saidas: 0 },
    });
    const res = await criar(comEmprestimo(2, outro.id));
    expect(res.status).toBe(201);
    expect(res.body.emprestimo_produto_id).toBe(outro.id);
    expect(await emEstoque(outro.id)).toBe(2);      // 4 - 2, o emprestado caiu
    expect(await emEstoque(produtoId)).toBe(10);    // o produto em garantia ficou intacto
  });

  it('empréstimo ativo sem produto_id → 400, nada gravado', async () => {
    const res = await criar({
      cliente: clienteBase,
      produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' },
      emprestimo: { ativo: true, quantidade: 2 },
    });
    expect(res.status).toBe(400);
    expect(await prisma.garantias.count()).toBe(0);
    expect(await emEstoque(produtoId)).toBe(10);
  });

  it('empréstimo maior que o estoque → 400, sem efeito colateral', async () => {
    const res = await criar(comEmprestimo(999));
    expect(res.status).toBe(400);
    expect(await emEstoque(produtoId)).toBe(10); // intacto
    expect(await prisma.garantias.count()).toBe(0); // transação revertida
  });

  it('devolução reverte o estoque e cria ENTRADA ligada à garantia', async () => {
    const g = (await criar(comEmprestimo(4))).body;
    expect(await emEstoque(produtoId)).toBe(6);

    const dev = await request(app).patch(`/api/garantias/${g.id}/devolver`).set(authAdmin());
    expect(dev.status).toBe(200);
    expect(dev.body.data.emprestimo_devolvido).toBe(true);
    expect(dev.body.data.emprestimo_devolvido_at).toBeTruthy();
    expect(await emEstoque(produtoId)).toBe(10); // voltou ao original

    const entrada = await prisma.movimentacoes.findFirst({ where: { garantia_id: g.id, tipo: 'ENTRADA' } });
    expect(entrada.quantidade).toBe(4);
  });

  it('devolver 2× → 400 na segunda (idempotência) e estoque não muda de novo', async () => {
    const g = (await criar(comEmprestimo(4))).body;
    await request(app).patch(`/api/garantias/${g.id}/devolver`).set(authAdmin());
    const segunda = await request(app).patch(`/api/garantias/${g.id}/devolver`).set(authAdmin());
    expect(segunda.status).toBe(400);
    expect(await emEstoque(produtoId)).toBe(10); // segue no valor da 1ª devolução
  });

  it('devolver garantia sem empréstimo → 400', async () => {
    const g = (await criar({ cliente: clienteBase, produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' } })).body;
    const res = await request(app).patch(`/api/garantias/${g.id}/devolver`).set(authAdmin());
    expect(res.status).toBe(400);
  });

  it('devolver garantia inexistente → 404', async () => {
    const res = await request(app).patch('/api/garantias/99999/devolver').set(authAdmin());
    expect(res.status).toBe(404);
  });

  /* ===== Parte 1 — bugs de ciclo do empréstimo ===== */

  it('excluir garantia com empréstimo pendente reverte o estoque (ENTRADA)', async () => {
    const g = (await criar(comEmprestimo(3))).body;
    expect(await emEstoque(produtoId)).toBe(7);

    const del = await request(app).delete(`/api/garantias/${g.id}`).set(authAdmin());
    expect(del.status).toBe(200);
    expect(await emEstoque(produtoId)).toBe(10); // bateria voltou ao estoque
    // reversão rastreável, mesmo com a garantia apagada
    const entrada = await prisma.movimentacoes.findFirst({ where: { garantia_id: g.id, tipo: 'ENTRADA' } });
    expect(entrada?.quantidade).toBe(3);
    expect(await prisma.garantias.count()).toBe(0);
  });

  it('excluir garantia já devolvida NÃO reverte de novo', async () => {
    const g = (await criar(comEmprestimo(3))).body;
    await request(app).patch(`/api/garantias/${g.id}/devolver`).set(authAdmin());
    expect(await emEstoque(produtoId)).toBe(10);

    const del = await request(app).delete(`/api/garantias/${g.id}`).set(authAdmin());
    expect(del.status).toBe(200);
    expect(await emEstoque(produtoId)).toBe(10); // não passa de 10 (sem dupla reversão)
  });

  it('excluir garantia SEM empréstimo não mexe no estoque', async () => {
    const g = (await criar({ cliente: clienteBase, produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' } })).body;
    const del = await request(app).delete(`/api/garantias/${g.id}`).set(authAdmin());
    expect(del.status).toBe(200);
    expect(await emEstoque(produtoId)).toBe(10);
  });

  // Reforço (itens 4/5): excluir uma garantia NÃO finalizada com bateria
  // emprestada não pode "sumir" com a bateria — o produto EMPRESTADO volta.
  it('excluir garantia não finalizada devolve o PRODUTO EMPRESTADO ao estoque', async () => {
    const marcaLocal = (await prisma.marca.findFirst()).id;
    const emprestado = await prisma.estoque.create({
      data: { produto: 'Bateria Empréstimo', modelo: 'EMP-1', marca_id: marcaLocal, custo: '90', valor_venda: '140', qtd_minima: 1, qtd_inicial: 5, entradas: 0, saidas: 0 },
    });
    // garantia aberta (status default AGUARDANDO_ENVIO), empresta OUTRO produto
    const g = (await criar(comEmprestimo(2, emprestado.id))).body;
    expect(g.status).toBe('AGUARDANDO_ENVIO');
    expect(await emEstoque(emprestado.id)).toBe(3); // saiu 2

    const del = await request(app).delete(`/api/garantias/${g.id}`).set(authAdmin());
    expect(del.status).toBe(200);
    expect(await emEstoque(emprestado.id)).toBe(5);   // o emprestado voltou
    expect(await emEstoque(produtoId)).toBe(10);      // o produto da garantia nunca foi tocado
    const entrada = await prisma.movimentacoes.findFirst({ where: { garantia_id: g.id, tipo: 'ENTRADA' } });
    expect(entrada.produto_id).toBe(emprestado.id);
    expect(entrada.quantidade).toBe(2);
    expect(entrada.motivo).toMatch(/exclus/i);
  });

  // Item 1: a SAÍDA de empréstimo (garantia_id, valor_final 0) NÃO pode entrar
  // no resumo do dashboard como venda/custo/prejuízo.
  it('empréstimo fica FORA do resumo do dashboard (não vira prejuízo)', async () => {
    // venda real: 1 unidade a 300 (custo 200 → lucro 100)
    await request(app).post('/api/movimentacoes').set(authAdmin())
      .send({ produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: '300' });
    // empréstimo: 2 unidades (SAÍDA garantia_id, valor_final 0)
    await criar(comEmprestimo(2));

    const res = await request(app).get('/api/movimentacoes/resumo').set(authAdmin());
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.qtdVendas).toBe(1);        // só a venda real (não as 2 do empréstimo)
    expect(d.custoVendido).toBe(200);   // custo de 1 un.; sem +400 do empréstimo
    expect(d.lucroBruto).toBe(100);     // 300 − 200; não negativo
  });

  it('ATIVAR empréstimo na edição (PATCH) dá a mesma baixa da criação', async () => {
    const g = (await criar({ cliente: clienteBase, produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' } })).body;
    expect(await emEstoque(produtoId)).toBe(10);

    const res = await request(app).patch(`/api/garantias/${g.id}`).set(authAdmin())
      .send({ emprestimo: { ativo: true, produto_id: produtoId, quantidade: 2 } });
    expect(res.status).toBe(200);
    expect(res.body.emprestimo_produto_id).toBe(produtoId);
    expect(res.body.emprestimo_quantidade).toBe(2);
    expect(res.body.emprestimo_devolvido).toBe(false);
    expect(await emEstoque(produtoId)).toBe(8);
    const mov = await prisma.movimentacoes.findFirst({ where: { garantia_id: g.id, tipo: 'SAIDA' } });
    expect(mov?.quantidade).toBe(2);
  });

  it('PATCH com empréstimo já ativo NÃO duplica a baixa', async () => {
    const g = (await criar(comEmprestimo(3))).body;
    expect(await emEstoque(produtoId)).toBe(7);
    // reenvia emprestimo ativo — não deve baixar de novo
    const res = await request(app).patch(`/api/garantias/${g.id}`).set(authAdmin())
      .send({ emprestimo: { ativo: true, produto_id: produtoId, quantidade: 3 }, garantia: { status: 'RECOLHIDA' } });
    expect(res.status).toBe(200);
    expect(await emEstoque(produtoId)).toBe(7); // segue 7, sem dupla baixa
  });

  it('ATIVAR empréstimo na edição sem produto_id → 400, sem baixa', async () => {
    const g = (await criar({ cliente: clienteBase, produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' } })).body;
    const res = await request(app).patch(`/api/garantias/${g.id}`).set(authAdmin())
      .send({ emprestimo: { ativo: true, quantidade: 2 } });
    expect(res.status).toBe(400);
    expect(await emEstoque(produtoId)).toBe(10);
  });
});

/* ===== Parte 2 — finalização ===== */
describe('PATCH /api/garantias/:id/finalizar', () => {
  const comEmprestimo = (qtd, status) => ({
    cliente: clienteBase,
    produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' },
    garantia: status ? { status } : undefined,
    emprestimo: { ativo: true, produto_id: produtoId, quantidade: qtd },
  });

  it('finalizar fora de EM_LOJA → 409', async () => {
    const g = (await criar({
      cliente: clienteBase,
      produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' },
      garantia: { status: 'RECOLHIDA' },
    })).body;
    const res = await request(app).patch(`/api/garantias/${g.id}/finalizar`).set(authAdmin());
    expect(res.status).toBe(409);
    expect((await request(app).get(`/api/garantias/${g.id}`).set(authAdmin())).body.status).toBe('RECOLHIDA');
  });

  it('finalizar em EM_LOJA → status FINALIZADA', async () => {
    const g = (await criar({
      cliente: clienteBase,
      produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' },
      garantia: { status: 'EM_LOJA' },
    })).body;
    const res = await request(app).patch(`/api/garantias/${g.id}/finalizar`).set(authAdmin());
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FINALIZADA');
  });

  it('finalizar devolve o empréstimo pendente automaticamente', async () => {
    const g = (await criar(comEmprestimo(4, 'EM_LOJA'))).body;
    expect(await emEstoque(produtoId)).toBe(6); // baixa da ida

    const res = await request(app).patch(`/api/garantias/${g.id}/finalizar`).set(authAdmin());
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FINALIZADA');
    expect(res.body.data.emprestimo_devolvido).toBe(true);
    expect(await emEstoque(produtoId)).toBe(10); // devolvido junto da finalização
    const entrada = await prisma.movimentacoes.findFirst({ where: { garantia_id: g.id, tipo: 'ENTRADA' } });
    expect(entrada?.quantidade).toBe(4);
  });

  it('finalizar garantia inexistente → 404', async () => {
    const res = await request(app).patch('/api/garantias/99999/finalizar').set(authAdmin());
    expect(res.status).toBe(404);
  });
});
