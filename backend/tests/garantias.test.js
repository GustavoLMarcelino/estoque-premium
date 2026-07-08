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
      garantia: { status: 'ABERTA', descricaoProblema: 'Não segura carga' },
    });
    expect(res.status).toBe(201);
    expect(res.body.cliente_nome).toBe('João Cliente');
    expect(res.body.estoque_id).toBe(produtoId);
    expect(res.body.status).toBe('ABERTA');
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
      .send({ garantia: { status: 'APROVADA' }, cliente: { ...clienteBase, nome: 'João Editado' } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APROVADA');
    expect(res.body.cliente_nome).toBe('João Editado');
  });

  it('garantia inexistente → 404', async () => {
    const res = await request(app).patch('/api/garantias/99999').set(authAdmin()).send({ garantia: { status: 'APROVADA' } });
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
  const comEmprestimo = (qtd) => ({
    cliente: clienteBase,
    produto: { codigo: 'BAT-60', descricao: 'Bateria 60Ah' },
    emprestimo: { ativo: true, quantidade: qtd },
  });

  it('empréstimo dá baixa no estoque e persiste os campos na garantia', async () => {
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
});
