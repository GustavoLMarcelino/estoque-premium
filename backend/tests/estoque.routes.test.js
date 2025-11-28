process.env.JWT_SECRET = 'dev-secret-change-me';

import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';

const prisma = new PrismaClient();

describe('Testes essenciais do Estoque', () => {
    let token;

    beforeAll(async () => {

        await prisma.movimentacoes.deleteMany();
        await prisma.estoque.deleteMany();
        await prisma.user.deleteMany({ where: { email: { contains: 'test' } } });


        const hash = await bcrypt.hash('123456', 10);
        const user = await prisma.user.create({
            data: {
                name: 'Usuario Teste',
                email: 'test@example.com',
                password: hash,
                role: 'user',
            },
        });

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: '123456' });

        token = loginRes.body.token;
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('deve permitir acesso à rota protegida com token válido', async () => {
        const res = await request(app)
            .get('/api/protected')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/Acesso permitido/i);
    });

    it('deve bloquear acesso à rota protegida sem token', async () => {
        const res = await request(app).get('/api/protected');
        expect(res.status).toBe(401);
    });

    it('deve listar estoque vazio inicialmente', async () => {
        const res = await request(app)
            .get('/api/estoque')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(0);
        expect(res.body.data).toEqual([]);
    });

    it('deve criar um novo produto com sucesso', async () => {
        const res = await request(app)
            .post('/api/estoque')
            .set('Authorization', `Bearer ${token}`)
            .send({
                produto: 'Produto Teste',
                modelo: 'Modelo A',
                custo: 10,
                valor_venda: 15,
                percentual_lucro: 50,
                qtd_minima: 2,
                garantia: '12 meses',
                qtd_inicial: 5,
            });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.produto).toBe('Produto Teste');
    });

    it('deve retornar erro 400 quando faltam campos obrigatórios', async () => {
        const res = await request(app)
            .post('/api/estoque')
            .set('Authorization', `Bearer ${token}`)
            .send({
                modelo: 'Modelo B',
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/produto e modelo são obrigatórios/i);
    });

    it('deve listar todos os produtos cadastrados', async () => {
        const res = await request(app)
            .get('/api/estoque')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.total).toBeGreaterThan(0);
        expect(res.body.data[0]).toHaveProperty('produto');
    });

    it('deve atualizar produto com sucesso', async () => {
        const produtos = await prisma.estoque.findMany();
        const id = produtos[0].id;

        const res = await request(app)
            .put(`/api/estoque/${id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ valor_venda: 20 });

        expect(res.status).toBe(200);
        expect(Number(res.body.valor_venda).toFixed(2)).toBe('20.00');
    });

    it('deve remover produto com sucesso', async () => {
        const produtos = await prisma.estoque.findMany();
        const id = produtos[0].id;

        const res = await request(app)
            .delete(`/api/estoque/${id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(204);
    });

    it('deve retornar erro 409 ao tentar remover produto com movimentação vinculada', async () => {

        const produto = await prisma.estoque.create({
            data: {
                produto: 'Produto Vinculado',
                modelo: 'Modelo V',
                custo: '10.00',
                valor_venda: '15.00',
                qtd_minima: 1,
                qtd_inicial: 1,
                entradas: 0,
                saidas: 0,
                garantia: null,
            },
        });

        await prisma.movimentacoes.create({
            data: {
                tipo: 'ENTRADA',
                quantidade: 1,
                valor_final: '15.00',
                estoque: {
                    connect: { id: produto.id }
                }
            }
        });

        const res = await request(app)
            .delete(`/api/estoque/${produto.id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(409);
        expect(res.body.message).toMatch(/Não é possível remover/i);
    });
});
