import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

// Regressão: forma_pagamento e parcelas saíam da tela de Lançamento mas eram
// DESCARTADOS no createMovAPI.criar(), que desestruturava só alguns campos do
// payload. Toda venda simples de bateria era gravada sem forma de pagamento e
// o dashboard a contava com taxa R$ 0 — taxa subestimada, lucro superestimado.
//
// O teste exercita a CAMADA DE SERVICE do front (onde estava o bug) contra a
// API real: o axios é trocado por um cliente que fala com o app via supertest.
// Assim o que é verificado é o payload que o service monta de fato.
vi.mock('../../frontend/src/services/api.js', async () => {
  const supertest = (await import('supertest')).default;
  const { app: expressApp } = await import('../src/app.js');
  const { authAdmin: auth } = await import('./helpers/api.js');
  const chamar = async (metodo, caminho, payload) => {
    const res = await supertest(expressApp)[metodo](`/api${caminho}`).set(auth()).send(payload);
    if (res.status >= 400) {
      throw Object.assign(new Error(res.body?.message || 'erro'), { response: res });
    }
    return { data: res.body };
  };
  return {
    default: {
      post: (caminho, payload) => chamar('post', caminho, payload),
      get: (caminho) => chamar('get', caminho),
      put: (caminho, payload) => chamar('put', caminho, payload),
      delete: (caminho) => chamar('delete', caminho),
    },
  };
});

const { createMovAPI } = await import('../../frontend/src/services/apiFactories.js');
const MovAPI = createMovAPI('/movimentacoes');

let produtoId;

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.marca.deleteMany();
  const marcaId = (await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } })).id;
  const res = await request(app).post('/api/estoque').set(authAdmin()).send({
    produto: 'Bateria 60Ah', modelo: 'BAT-60', marca_id: marcaId,
    custo: 200, valor_venda: 400, valor_vista: 400, valor_parcelado: 450,
    qtd_minima: 1, qtd_inicial: 10,
  });
  produtoId = res.body.id;
});

describe('createMovAPI.criar — forma de pagamento chega ao banco', () => {
  it('crédito parcelado: forma_pagamento e parcelas são gravados', async () => {
    await MovAPI.criar({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 450,
      vendedor: 'Gustavo', forma_pagamento: 'credito', parcelas: 10,
    });

    const mov = await prisma.movimentacoes.findFirst({ orderBy: { id: 'desc' } });
    expect(mov.forma_pagamento).toBe('credito');
    expect(mov.parcelas).toBe(10);
  });

  it('pix: forma_pagamento gravada, parcelas fica null', async () => {
    await MovAPI.criar({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 400,
      forma_pagamento: 'pix',
    });

    const mov = await prisma.movimentacoes.findFirst({ orderBy: { id: 'desc' } });
    expect(mov.forma_pagamento).toBe('pix');
    expect(mov.parcelas).toBeNull();
  });

  it('sem forma de pagamento: segue gravando null (não inventa forma)', async () => {
    await MovAPI.criar({ produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 400 });

    const mov = await prisma.movimentacoes.findFirst({ orderBy: { id: 'desc' } });
    expect(mov.forma_pagamento).toBeNull();
  });

  it('a taxa do dashboard deixa de ser zero quando a forma chega', async () => {
    await MovAPI.criar({
      produto_id: produtoId, tipo: 'saida', quantidade: 1, valor_final: 450,
      forma_pagamento: 'credito', parcelas: 10,
    });

    const { body } = await request(app).get('/api/movimentacoes/resumo').set(authAdmin());
    expect(body.data.taxas).toBeGreaterThan(0);
    expect(body.data.vendasSemForma.qtd).toBe(0);
  });
});
