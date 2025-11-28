import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';

const prisma = new PrismaClient();

describe('Auth Routes', () => {

  beforeEach(async () => {
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('deve registrar um novo usuário com sucesso', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Rebeca Lara',
          email: 'rebeca@example.com',
          password: 'rebeca123',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toMatchObject({
        name: 'Rebeca Lara',
        email: 'rebeca@example.com',
        role: 'user',
      });
    });

    it('deve retornar erro 400 quando faltam campos obrigatórios', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Rebeca Lara',
          // falta email e password
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('name, email e password são obrigatórios');
    });

    it('deve retornar erro 409 quando email já está cadastrado', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Rebeca Lara',
          email: 'rebeca@example.com',
          password: 'rebeca123',
        });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Catapimbas Fulano',
          email: 'rebeca@example.com',
          password: 'senha123',
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('E-mail já cadastrado');
    });

    it('deve normalizar email para lowercase', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Rebeca Lara',
          email: 'REBECA@EXAMPLE.COM',
          password: 'rebeca123',
        });

      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe('rebeca@example.com');
    });

    it('deve criar usuário com role admin quando especificado', async () => {
      const response = await request(app)
        .post('/api/auth/register')
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

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      const hash = await bcrypt.hash('rebeca123', 10);
      await prisma.user.create({
        data: {
          name: 'Rebeca Lara',
          email: 'rebeca@example.com',
          password: hash,
          role: 'user',
        },
      });
    });

    it('deve fazer login com credenciais válidas', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rebeca@example.com',
          password: 'rebeca123',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toMatchObject({
        name: 'Rebeca Lara',
        email: 'rebeca@example.com',
        role: 'user',
      });
    });

    it('deve retornar erro 400 quando faltam credenciais', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rebeca@example.com',
          // falta password
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Email e senha são obrigatórios');
    });

    it('deve retornar erro 401 quando email não existe', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'naoexiste@example.com',
          password: 'senha123',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Credenciais inválidas');
    });

    it('deve retornar erro 401 quando senha está incorreta', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rebeca@example.com',
          password: 'senhaerrada',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Credenciais inválidas');
    });

    it('deve aceitar email em uppercase e converter para lowercase', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'REBECA@EXAMPLE.COM',
          password: 'rebeca123',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });
  });

  describe('GET /api/auth/me', () => {
    let token;
    let userId;

    beforeEach(async () => {
      const hash = await bcrypt.hash('rebeca123', 10);
      const user = await prisma.user.create({
        data: {
          name: 'Rebeca Lara',
          email: 'rebeca@example.com',
          password: hash,
          role: 'user',
        },
      });
      userId = user.id;

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rebeca@example.com',
          password: 'rebeca123',
        });

      token = loginResponse.body.token;
    });

    it('deve retornar dados do usuário autenticado', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toMatchObject({
        id: userId,
        name: 'Rebeca Lara',
        email: 'rebeca@example.com',
        role: 'user',
      });
    });

    it('deve retornar erro 401 quando token não é fornecido', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
    });

    it('deve retornar erro 401 quando token é inválido', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer tokeninvalido123');

      expect(response.status).toBe(401);
    });
  });
});