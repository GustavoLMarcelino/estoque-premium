import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';
import { dadosEstorno } from '../src/utils/estorno.js';

// Excluir uma ENTRADA tira unidades do saldo. Se as saídas já consumiram essas
// unidades, o acumulado de `entradas` comporta o estorno e o saldo ficava
// negativo em silêncio (qtd_inicial 0, entrada 5, saída 5 → excluir a entrada →
// saldo −5, resposta 204). Agora é 409 e nada muda.

const LINHAS = [
  { nome: 'Baterias', rota: '/api/movimentacoes', delegate: 'estoque', movs: 'movimentacoes' },
  { nome: 'Som', rota: '/api/movimentacoes-som', delegate: 'estoque_som', movs: 'movimentacoes_som' },
];

describe.each(LINHAS)('excluir entrada — $nome', ({ rota, delegate, movs }) => {
  let produtoId;

  beforeEach(async () => {
    await prisma.pedido_som_item.deleteMany();
    await prisma.pedido_som.deleteMany();
    await prisma.movimentacoes_som.deleteMany();
    await prisma.estoque_som.deleteMany();
    await prisma.movimentacoes.deleteMany();
    await prisma.garantias.deleteMany();
    await prisma.estoque.deleteMany();
    await prisma.venda_auditoria.deleteMany();
    const marca = await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } });
    produtoId = (await prisma[delegate].create({
      data: {
        produto: 'Produto Estorno', modelo: 'PE-1', marca_id: marca.id, custo: '100.00', valor_venda: '150.00',
        qtd_minima: 1, qtd_inicial: 0, entradas: 0, saidas: 0,
      },
    })).id;
  });

  const lancar = (tipo, quantidade) => request(app).post(rota).set(authAdmin())
    .send({ produto_id: produtoId, tipo, quantidade, valor_final: 150 });
  const excluir = (id) => request(app).delete(`${rota}/${id}`).set(authAdmin());
  const produto = () => prisma[delegate].findUnique({ where: { id: produtoId } });

  it('entrada já consumida por saídas → 409, estoque, movimentação e auditoria intactos', async () => {
    const entrada = (await lancar('entrada', 5)).body;
    expect((await lancar('saida', 5)).status).toBe(201);

    const res = await excluir(entrada.id);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/já foi consumida/i);
    const p = await produto();
    expect(p.entradas).toBe(5);
    expect(p.saidas).toBe(5);
    expect(await prisma[movs].count()).toBe(2);
    expect(await prisma.venda_auditoria.count()).toBe(0); // a auditoria desfez junto com a transação
  });

  it('entrada consumida em parte (saldo ficaria −1) → 409', async () => {
    await prisma[delegate].update({ where: { id: produtoId }, data: { qtd_inicial: 3 } });
    const entrada = (await lancar('entrada', 5)).body;
    expect((await lancar('saida', 4)).status).toBe(201); // saldo 4

    const res = await excluir(entrada.id); // 3 + 0 − 4 = −1

    expect(res.status).toBe(409);
    expect((await produto()).entradas).toBe(5);
  });

  it('limite exato: o saldo fica em 0 → exclui (204)', async () => {
    await prisma[delegate].update({ where: { id: produtoId }, data: { qtd_inicial: 3 } });
    const entrada = (await lancar('entrada', 5)).body;
    expect((await lancar('saida', 3)).status).toBe(201); // saldo 5

    const res = await excluir(entrada.id); // 3 + 0 − 3 = 0

    expect(res.status).toBe(204);
    const p = await produto();
    expect(p.entradas).toBe(0);
    expect(p.saidas).toBe(3);
  });

  it('entrada não consumida → continua funcionando (204) e o agregado volta', async () => {
    const entrada = (await lancar('entrada', 5)).body;

    const res = await excluir(entrada.id);

    expect(res.status).toBe(204);
    expect((await produto()).entradas).toBe(0);
    expect(await prisma[movs].count()).toBe(0);
  });

  it('excluir SAÍDA continua devolvendo o estoque', async () => {
    await lancar('entrada', 5);
    const saida = (await lancar('saida', 2)).body;

    const res = await excluir(saida.id);

    expect(res.status).toBe(204);
    expect((await produto()).saidas).toBe(0);
  });
});

describe('dadosEstorno (função pura)', () => {
  const rotulo = 'Alto-falante - AF-6';

  it('ENTRADA consumida lança 409 com a mensagem e o saldo que ficaria', () => {
    const erro = (() => {
      try { dadosEstorno({ tipo: 'ENTRADA', quantidade: 5, produto: { qtd_inicial: 0, entradas: 5, saidas: 5 }, rotulo }); } catch (e) { return e; }
    })();
    expect(erro.statusCode).toBe(409);
    expect(erro.message).toMatch(/já foi consumida/i);
    expect(erro.message).toContain('Alto-falante - AF-6');
    expect(erro.message).toContain('-5');
  });

  it('ENTRADA com saldo suficiente devolve o decrement de entradas', () => {
    expect(dadosEstorno({ tipo: 'ENTRADA', quantidade: 5, produto: { qtd_inicial: 0, entradas: 5, saidas: 0 }, rotulo }))
      .toEqual({ entradas: { decrement: 5 } });
  });

  it('SAÍDA não é afetada pela conferência de saldo (só devolve unidades)', () => {
    expect(dadosEstorno({ tipo: 'SAIDA', quantidade: 2, produto: { qtd_inicial: 0, entradas: 0, saidas: 2 }, rotulo }))
      .toEqual({ saidas: { decrement: 2 } });
  });

  it('estorno maior que o acumulado continua sendo 409 (regra anterior)', () => {
    expect(() => dadosEstorno({ tipo: 'SAIDA', quantidade: 3, produto: { qtd_inicial: 0, entradas: 0, saidas: 2 }, rotulo }))
      .toThrow(/deixaria saidas em -1/);
  });

  it('campos nulos contam como 0', () => {
    expect(dadosEstorno({ tipo: 'ENTRADA', quantidade: 2, produto: { qtd_inicial: 0, entradas: 2, saidas: null }, rotulo }))
      .toEqual({ entradas: { decrement: 2 } });
  });
});
