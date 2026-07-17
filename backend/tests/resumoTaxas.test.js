import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';
import { taxaSobreReceita } from '../src/utils/taxas.js';

// user id 2 (helpers) tem todos os módulos mas ver_custo=false — perfeito para
// checar que o lucro líquido (derivado do custo) NÃO vaza.

const produtoBase = {
  produto: 'Bateria Resumo',
  modelo: 'BR-60',
  custo: '100.00',
  valor_venda: '200.00',
  qtd_minima: 1,
  qtd_inicial: 50,
  entradas: 0,
  saidas: 0,
};

let produtoId;

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.taxas_config.deleteMany();
  const marca = await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } });
  produtoId = (await prisma.estoque.create({ data: { ...produtoBase, marca_id: marca.id } })).id;
});

const venda = (body) =>
  request(app).post('/api/movimentacoes').set(authAdmin()).send({ produto_id: produtoId, tipo: 'saida', ...body });

const resumo = (auth) => request(app).get('/api/movimentacoes/resumo').set(auth);

describe('GET /resumo — taxa calculada no servidor a partir do banco', () => {
  it('persiste forma/parcelas e calcula a taxa da config (crédito 10x)', async () => {
    const r = await venda({ quantidade: 1, valor_final: '200.00', forma_pagamento: 'credito', parcelas: 10 });
    expect(r.status).toBe(201);
    expect(r.body.forma_pagamento).toBe('credito');
    expect(r.body.parcelas).toBe(10);

    const res = await resumo(authAdmin());
    expect(res.status).toBe(200);
    const d = res.body.data;

    // taxa esperada = a do modelo (config default semeada pela rota) sobre a receita
    const cfg = await prisma.taxas_config.findFirst();
    const esperada = taxaSobreReceita(200, 'credito', 10, cfg).valor;
    expect(d.taxas).toBeCloseTo(esperada, 2);
    expect(d.vendasBrutas).toBe(200);
    expect(d.lucroBruto).toBe(100); // 200 − custo 100
    expect(d.lucroLiquido).toBeCloseTo(100 - esperada, 2);
  });

  it('crédito à vista (1x) NÃO tem antecipação; débito usa 1,36%', async () => {
    await venda({ quantidade: 1, valor_final: '100.00', forma_pagamento: 'credito', parcelas: 1 });
    await venda({ quantidade: 1, valor_final: '100.00', forma_pagamento: 'debito' });

    // /resumo cria a config default (lazy) se ainda não existir — chama antes de lê-la.
    const res = await resumo(authAdmin());
    const cfg = await prisma.taxas_config.findFirst();
    const esperada =
      taxaSobreReceita(100, 'credito', 1, cfg).valor + taxaSobreReceita(100, 'debito', null, cfg).valor;
    expect(res.body.data.taxas).toBeCloseTo(esperada, 2);
  });

  it('parcelas é ignorado (null) fora do crédito', async () => {
    const r = await venda({ quantidade: 1, valor_final: '100.00', forma_pagamento: 'debito', parcelas: 6 });
    expect(r.status).toBe(201);
    expect(r.body.parcelas).toBeNull();
  });
});

describe('GET /resumo — lucro líquido respeita ver_custo', () => {
  beforeEach(async () => {
    await venda({ quantidade: 1, valor_final: '200.00', forma_pagamento: 'credito', parcelas: 10 });
  });

  it('admin (vê custo): recebe custoVendido, lucroBruto e lucroLiquido', async () => {
    const d = (await resumo(authAdmin())).body.data;
    expect(d.custoVendido).toBe(100);
    expect(d.lucroBruto).toBe(100);
    expect(d.lucroLiquido).toBeDefined();
  });

  it('user sem ver_custo: taxa aparece, mas custo/lucro (bruto e líquido) NÃO', async () => {
    const d = (await resumo(authUser())).body.data;
    expect(d.taxas).toBeGreaterThan(0);        // taxa deriva da receita, pode ver
    expect(d.vendasBrutas).toBe(200);
    expect(d.custoVendido).toBeUndefined();     // deriva do custo → omitido
    expect(d.lucroBruto).toBeUndefined();
    expect(d.lucroLiquido).toBeUndefined();     // líquido deriva do custo → também omitido
  });
});

describe('GET /resumo — vendas sem forma de pagamento são sinalizadas', () => {
  it('venda sem forma → taxa 0 e entra em vendasSemForma', async () => {
    await venda({ quantidade: 1, valor_final: '150.00' }); // sem forma_pagamento
    const d = (await resumo(authAdmin())).body.data;
    expect(d.taxas).toBe(0);
    expect(d.vendasSemForma.qtd).toBe(1);
    expect(d.vendasSemForma.receita).toBe(150);
  });
});
