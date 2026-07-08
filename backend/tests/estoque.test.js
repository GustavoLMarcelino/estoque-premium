import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

// em_estoque derivado (mesma conta do backend)
const emEstoque = (p) => Number(p.qtd_inicial ?? 0) + Number(p.entradas ?? 0) - Number(p.saidas ?? 0);

let marcaId;

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.marca.deleteMany();
  marcaId = (await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } })).id;
});

const baseProduto = () => ({
  produto: 'Bateria 60Ah', modelo: 'BAT-60', marca_id: marcaId,
  custo: 200, valor_venda: 300, qtd_minima: 1, qtd_inicial: 5,
});

// Roda a mesma bateria de testes para os dois estoques (mesma lógica de PUT).
const cenarios = [
  { nome: 'estoque (baterias)', base: '/api/estoque', model: () => prisma.estoque },
  { nome: 'estoque-som', base: '/api/estoque-som', model: () => prisma.estoque_som },
];

for (const { nome, base, model } of cenarios) {
  describe(`PUT ${base}/:id — trava de qtd_inicial [${nome}]`, () => {
    async function criar(qtd_inicial = 5) {
      const res = await request(app).post(base).set(authAdmin()).send({ ...baseProduto(), qtd_inicial });
      expect(res.status).toBe(201);
      return res.body;
    }

    it('(b) SEM movimentação: aceita e grava a nova qtd_inicial', async () => {
      const p = await criar(5);
      const res = await request(app).put(`${base}/${p.id}`).set(authAdmin())
        .send({ produto: p.produto, modelo: p.modelo, custo: 200, valor_venda: 300, qtd_inicial: 12 });
      expect(res.status).toBe(200);
      const depois = await model().findUnique({ where: { id: p.id } });
      expect(depois.qtd_inicial).toBe(12);
      expect(emEstoque(depois)).toBe(12); // saldo reflete a correção
    });

    it('(a) COM movimentação: rejeita a mudança de qtd_inicial (409) e não altera', async () => {
      const p = await criar(5);
      // simula que já houve movimento (uma entrada registrada)
      await model().update({ where: { id: p.id }, data: { entradas: 3 } });

      const res = await request(app).put(`${base}/${p.id}`).set(authAdmin())
        .send({ produto: p.produto, modelo: p.modelo, custo: 200, valor_venda: 300, qtd_inicial: 99 });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Entrada.*Sa[ií]da|movimenta/i);

      const depois = await model().findUnique({ where: { id: p.id } });
      expect(depois.qtd_inicial).toBe(5); // intacto
    });

    it('COM movimentação: editar OUTROS campos (mesmo qtd_inicial) continua funcionando', async () => {
      const p = await criar(5);
      await model().update({ where: { id: p.id }, data: { saidas: 2 } });

      const res = await request(app).put(`${base}/${p.id}`).set(authAdmin())
        .send({ produto: 'Bateria 60Ah PRO', modelo: p.modelo, custo: 250, valor_venda: 380, qtd_inicial: 5 });
      expect(res.status).toBe(200);
      const depois = await model().findUnique({ where: { id: p.id } });
      expect(depois.produto).toBe('Bateria 60Ah PRO');
      expect(depois.qtd_inicial).toBe(5);
    });

    it('produto inexistente → 404', async () => {
      const res = await request(app).put(`${base}/999999`).set(authAdmin())
        .send({ produto: 'X', modelo: 'Y', custo: 10, valor_venda: 20 });
      expect(res.status).toBe(404);
    });
  });
}
