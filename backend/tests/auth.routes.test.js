import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import app from '../src/server.js'; // ajuste o caminho conforme seu projeto

const prisma = new PrismaClient();

describe('Auth Routes', () => {
  // Limpar banco antes de cada teste
  beforeEach(async () => {
    await prisma.user.deleteMany({});
  });

  // Fechar conexão após todos os testes
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /register', () => {
    it('deve registrar um novo usuário com sucesso', async () => {
      const response = await request(app)
        .post('/register')
        .send({
          name: 'João Silva',
          email: 'joao@example.com',
          password: 'senha123',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toMatchObject({
        name: 'João Silva',
        email: 'joao@example.com',
        role: 'user',
      });
    });

    it('deve retornar erro 400 quando faltam campos obrigatórios', async () => {
      const response = await request(app)
        .post('/register')
        .send({
          name: 'João Silva',
          // falta email e password
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('name, email e password são obrigatórios');
    });

    it('deve retornar erro 409 quando email já está cadastrado', async () => {
      // Criar usuário primeiro
      await request(app)
        .post('/register')
        .send({
          name: 'João Silva',
          email: 'joao@example.com',
          password: 'senha123',
        });

      // Tentar cadastrar novamente
      const response = await request(app)
        .post('/register')
        .send({
          name: 'Maria Silva',
          email: 'joao@example.com',
          password: 'outrasenha',
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('E-mail já cadastrado');
    });

    it('deve normalizar email para lowercase', async () => {
      const response = await request(app)
        .post('/register')
        .send({
          name: 'João Silva',
          email: 'JOAO@EXAMPLE.COM',
          password: 'senha123',
        });

      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe('joao@example.com');
    });

    it('deve criar usuário com role admin quando especificado', async () => {
      const response = await request(app)
        .post('/register')
        .send({
          name: 'Admin User',
          email: 'admin@example.com',
          password: 'senha123',
          role: 'admin',
        });

      expect(response.status).toBe(201);
      expect(response.body.user.role).toBe('admin');
    });
  });

  describe('POST /login', () => {
    beforeEach(async () => {
      // Criar usuário de teste antes de cada teste de login
      const hash = await bcrypt.hash('senha123', 10);
      await prisma.user.create({
        data: {
          name: 'João Silva',
          email: 'joao@example.com',
          password: hash,
          role: 'user',
        },
      });
    });

    it('deve fazer login com credenciais válidas', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'joao@example.com',
          password: 'senha123',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toMatchObject({
        name: 'João Silva',
        email: 'joao@example.com',
        role: 'user',
      });
    });

    it('deve retornar erro 400 quando faltam credenciais', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'joao@example.com',
          // falta password
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Email e senha são obrigatórios');
    });

    it('deve retornar erro 401 quando email não existe', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'naoexiste@example.com',
          password: 'senha123',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Credenciais inválidas');
    });

    it('deve retornar erro 401 quando senha está incorreta', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'joao@example.com',
          password: 'senhaerrada',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Credenciais inválidas');
    });

    it('deve aceitar email em uppercase e converter para lowercase', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          email: 'JOAO@EXAMPLE.COM',
          password: 'senha123',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });
  });

  describe('GET /me', () => {
    let token;
    let userId;

    beforeEach(async () => {
      // Criar usuário e obter token
      const hash = await bcrypt.hash('senha123', 10);
      const user = await prisma.user.create({
        data: {
          name: 'João Silva',
          email: 'joao@example.com',
          password: hash,
          role: 'user',
        },
      });
      userId = user.id;

      // Fazer login para obter token
      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'joao@example.com',
          password: 'senha123',
        });

      token = loginResponse.body.token;
    });

    it('deve retornar dados do usuário autenticado', async () => {
      const response = await request(app)
        .get('/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        id: userId,
        name: 'João Silva',
        email: 'joao@example.com',
        role: 'user',
      });
    });

    it('deve retornar erro 401 quando token não é fornecido', async () => {
      const response = await request(app).get('/me');

      expect(response.status).toBe(401);
    });

    it('deve retornar erro 401 quando token é inválido', async () => {
      const response = await request(app)
        .get('/me')
        .set('Authorization', 'Bearer tokeninvalido123');

      expect(response.status).toBe(401);
    });
  });
});