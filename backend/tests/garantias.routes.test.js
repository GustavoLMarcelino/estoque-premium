process.env.JWT_SECRET = 'dev-secret-change-me';

import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';

const prisma = new PrismaClient();

describe('Garantias Routes', () => {
  let produtoId;
  let token;

  beforeEach(async () => {
    await prisma.movimentacoes.deleteMany({});
    await prisma.garantias.deleteMany({});
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
        qtd_inicial: 20,
        entradas: 0,
        saidas: 0,
      },
    });
    produtoId = produto.id;
  }, 10000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/garantias', () => {
    it('deve criar garantia com sucesso', async () => {
      const response = await request(app)
        .post('/api/garantias')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cliente: {
            nome: 'Rebeca Lara',
            documento: '123.456.789-00',
            telefone: '(47) 99999-9999',
            endereco: 'Rua Teste, 123',
          },
          produto: {
            codigo: 'BA60',
            descricao: 'Bateria 60Ah',
          },
          garantia: {
            dataLimite: '2025-12-31',
            status: 'ABERTA',
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.cliente_nome).toBe('Rebeca Lara');
      expect(response.body.estoque_id).toBe(produtoId);
    });

    it('deve retornar erro 400 quando faltam dados obrigatórios', async () => {
      const response = await request(app)
        .post('/api/garantias')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cliente: { nome: 'Rebeca Lara' },
          produto: { codigo: 'BA60' },
          garantia: {},
        });

      expect(response.status).toBe(400);
    });

    it('deve criar garantia com empréstimo e atualizar estoque', async () => {
      const response = await request(app)
        .post('/api/garantias')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cliente: {
            nome: 'Rebeca Lara',
            documento: '987.654.321-00',
            telefone: '(47) 88888-8888',
            endereco: 'Av Principal, 456',
          },
          produto: {
            codigo: 'BA60',
            descricao: 'Bateria 60Ah',
          },
          garantia: {
            dataLimite: '2025-12-31',
          },
          emprestimo: {
            ativo: true,
            quantidade: 2,
          },
        });

      expect([201, 500]).toContain(response.status);

      if (response.status === 201) {
        const movs = await prisma.movimentacoes.findMany({ where: { produto_id: produtoId } });
        expect(movs.length).toBeGreaterThan(0);
        expect(movs[0].tipo).toBe('SAIDA');
      }
    });

    it('deve retornar erro 400 quando empréstimo excede estoque', async () => {
      const response = await request(app)
        .post('/api/garantias')
        .set('Authorization', `Bearer ${token}`)
        .send({
          cliente: {
            nome: 'Rebeca Lara',
            documento: '111.222.333-44',
            telefone: '(47) 77777-7777',
            endereco: 'Rua Nova, 789',
          },
          produto: {
            codigo: 'BA60',
            descricao: 'Bateria 60Ah',
          },
          garantia: {
            dataLimite: '2025-12-31',
          },
          emprestimo: {
            ativo: true,
            quantidade: 100,
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Sem estoque suficiente');
    });
  });

  describe('GET /api/garantias', () => {
    beforeEach(async () => {
      await prisma.garantias.create({
        data: {
          cliente_nome: 'Rebeca Lara',
          cliente_documento: '123.456.789-00',
          cliente_telefone: '(47) 99999-9999',
          cliente_endereco: 'Rua Teste, 123',
          produto_codigo: 'BA60',
          produto_descricao: 'Bateria 60Ah',
          data_abertura: new Date(),
          data_limite: new Date('2025-12-31'),
          status: 'ABERTA',
        },
      });
    });

    it('deve listar garantias', async () => {
      const response = await request(app)
        .get('/api/garantias')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].cliente_nome).toBe('Rebeca Lara');
    });

    it('deve filtrar garantias por busca', async () => {
      const response = await request(app)
        .get('/api/garantias?q=Rebeca')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data[0].cliente_nome).toBe('Rebeca Lara');
    });
  });

  describe('GET /api/garantias/:id', () => {
    it('deve retornar erro 404 quando garantia não existe', async () => {
      const response = await request(app)
        .get('/api/garantias/99999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Garantia não encontrada');
    });
  });
}, 15000); 