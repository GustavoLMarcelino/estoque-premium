jest.setTimeout(30000);
process.env.JWT_SECRET = 'dev-secret-change-me';

import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';

const prisma = new PrismaClient();

describe('Movimentações Routes', () => {
  let produtoId;
  let token;

  beforeAll(async () => {
    await prisma.movimentacoes.deleteMany({});
    await prisma.estoque.deleteMany({});
    await prisma.user.deleteMany({});

    const hash = await bcrypt.hash('rebeca123', 10);
    await prisma.user.create({
      data: {
        name: 'Rebeca Lara',
        email: 'rebeca@example.com',
        password: hash,
        role: 'admin',
      },
    });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'rebeca@example.com',
        password: 'rebeca123',
      });

    token = loginResponse.body.token;

    const produto = await prisma.estoque.create({
      data: {
        produto: 'Bateria 60Ah',
        modelo: 'BA60',
        custo: '350.00',
        valor_venda: '500.00',
        qtd_minima: 5,
        garantia: '12 meses',
        qtd_inicial: 10,
        entradas: 0,
        saidas: 0,
      },
    });

    produtoId = produto.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/movimentacoes', () => {

    beforeEach(async () => {
      await prisma.movimentacoes.deleteMany({});
      await prisma.estoque.update({
        where: { id: produtoId },
        data: { entradas: 0, saidas: 0 }
      });
    });

    it('deve criar entrada e atualizar estoque', async () => {
      const response = await request(app)
        .post('/api/movimentacoes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          produto_id: produtoId,
          tipo: 'entrada',
          quantidade: 5,
          valor_final: 250,
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        produto_id: produtoId,
        tipo: 'ENTRADA',
        quantidade: 5,
      });

      expect(["250", "250.00"]).toContain(response.body.valor_final);

      const produto = await prisma.estoque.findUnique({ where: { id: produtoId } });
      expect(produto.entradas).toBe(5);
    });

    it('deve criar saída e atualizar estoque', async () => {
      const response = await request(app)
        .post('/api/movimentacoes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          produto_id: produtoId,
          tipo: 'saida',
          quantidade: 3,
          valor_final: 150,
        });

      expect(response.status).toBe(201);
      expect(response.body.tipo).toBe('SAIDA');

      const produto = await prisma.estoque.findUnique({ where: { id: produtoId } });
      expect(produto.saidas).toBe(3);
    });

    it('deve retornar erro 400 quando quantidade <= 0', async () => {
      const response = await request(app)
        .post('/api/movimentacoes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          produto_id: produtoId,
          tipo: 'entrada',
          quantidade: 0,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('quantidade deve ser > 0');
    });

    it('deve retornar erro 400 quando tipo é inválido', async () => {
      const response = await request(app)
        .post('/api/movimentacoes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          produto_id: produtoId,
          tipo: 'invalido',
          quantidade: 5,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('tipo inválido');
    });

    it('deve retornar erro 409 quando saída excede estoque', async () => {
      const response = await request(app)
        .post('/api/movimentacoes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          produto_id: produtoId,
          tipo: 'saida',
          quantidade: 100,
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('excede o estoque atual');
    });

    it('deve usar valor_final padrão quando não fornecido', async () => {
      const response = await request(app)
        .post('/api/movimentacoes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          produto_id: produtoId,
          tipo: 'entrada',
          quantidade: 5,
        });

      expect(response.status).toBe(201);

      expect(["0", "0.00"]).toContain(response.body.valor_final);
    });
  });

  describe('GET /api/movimentacoes', () => {

    beforeEach(async () => {
      await prisma.movimentacoes.deleteMany({});

      await prisma.movimentacoes.createMany({
        data: [
          { produto_id: produtoId, tipo: 'ENTRADA', quantidade: 5, valor_final: '250.00' },
          { produto_id: produtoId, tipo: 'SAIDA', quantidade: 2, valor_final: '100.00' },
        ],
      });
    });

    it('deve listar todas as movimentações', async () => {
      const response = await request(app)
        .get('/api/movimentacoes')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    it('deve filtrar por produto_id', async () => {
      const response = await request(app)
        .get(`/api/movimentacoes?produto_id=${produtoId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.every(m => m.produto_id === produtoId)).toBe(true);
    });
  });

  describe('DELETE /api/movimentacoes/:id', () => {
    it('deve remover movimentação e desfazer agregados', async () => {
      const mov = await prisma.movimentacoes.create({
        data: {
          produto_id: produtoId,
          tipo: 'ENTRADA',
          quantidade: 5,
          valor_final: '250.00'
        },
      });

      await prisma.estoque.update({
        where: { id: produtoId },
        data: { entradas: 5 },
      });

      const response = await request(app)
        .delete(`/api/movimentacoes/${mov.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(204);

      const produto = await prisma.estoque.findUnique({ where: { id: produtoId } });
      expect(produto.entradas).toBe(0);
    });
  });
});
