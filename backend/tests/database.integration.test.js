
process.env.JWT_SECRET = 'dev-secret-change-me';

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

describe('Integração Banco de Dados', () => {
  beforeEach(async () => {
    await prisma.movimentacoes.deleteMany({});
    await prisma.garantias.deleteMany({});
    await prisma.estoque.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Transações Atômicas', () => {
    it('deve reverter transação quando ocorre erro', async () => {
      const produto = await prisma.estoque.create({
        data: {
          produto: 'Bateria Teste',
          modelo: 'BT01',
          custo: '100.00',
          valor_venda: '200.00',
          qtd_minima: 5,
          garantia: '12 meses',
          qtd_inicial: 10,
          entradas: 0,
          saidas: 0,
        },
      });

      try {
        await prisma.$transaction(async (tx) => {
          await tx.movimentacoes.create({
            data: {
              produto_id: 99999,
              tipo: 'ENTRADA',
              quantidade: 5,
              valor_final: '0.00',
            },
          });
        });
      } catch (error) {

      }

      const movs = await prisma.movimentacoes.count();
      expect(movs).toBe(0);
    });

    it('deve garantir consistência em transação de movimentação', async () => {
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

      await prisma.$transaction(async (tx) => {
        await tx.movimentacoes.create({
          data: {
            produto_id: produto.id,
            tipo: 'ENTRADA',
            quantidade: 5,
            valor_final: '0.00',
          },
        });

        await tx.estoque.update({
          where: { id: produto.id },
          data: { entradas: 5 },
        });
      });

      const produtoAtualizado = await prisma.estoque.findUnique({
        where: { id: produto.id },
      });
      const movs = await prisma.movimentacoes.count();

      expect(produtoAtualizado.entradas).toBe(5);
      expect(movs).toBe(1);
    });
  });

  describe('Integridade Referencial', () => {
    it('deve impedir remoção de produto com movimentações vinculadas', async () => {
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

      await prisma.movimentacoes.create({
        data: {
          produto_id: produto.id,
          tipo: 'ENTRADA',
          quantidade: 5,
          valor_final: '0.00',
        },
      });

      await expect(
        prisma.estoque.delete({ where: { id: produto.id } })
      ).rejects.toThrow();

      const produtoExists = await prisma.estoque.findUnique({
        where: { id: produto.id },
      });
      expect(produtoExists).not.toBeNull();
    });

    it('deve permitir remoção de produto sem movimentações', async () => {
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

      await prisma.estoque.delete({ where: { id: produto.id } });

      const produtoRemovido = await prisma.estoque.findUnique({
        where: { id: produto.id },
      });
      expect(produtoRemovido).toBeNull();
    });
  });

  describe('Cálculos e Consistência', () => {
    it('deve manter consistência entre entradas, saídas e estoque', async () => {
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


      await prisma.estoque.update({
        where: { id: produto.id },
        data: { entradas: 15 },
      });


      await prisma.estoque.update({
        where: { id: produto.id },
        data: { saidas: 7 },
      });

      const produtoAtualizado = await prisma.estoque.findUnique({
        where: { id: produto.id },
      });

      const estoqueEsperado =
        produtoAtualizado.qtd_inicial +
        produtoAtualizado.entradas -
        produtoAtualizado.saidas;

      expect(estoqueEsperado).toBe(18);
    });

    it('deve registrar data de movimentação automaticamente', async () => {
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

      const mov = await prisma.movimentacoes.create({
        data: {
          produto_id: produto.id,
          tipo: 'ENTRADA',
          quantidade: 5,
          valor_final: '250.00',
        },
      });

      expect(mov.data_movimentacao).toBeInstanceOf(Date);
      expect(mov.data_movimentacao.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Conexão e Performance', () => {
    it('deve conectar ao banco de dados com sucesso', async () => {
      await expect(prisma.$connect()).resolves.not.toThrow();
    });

    it('deve executar queries em paralelo corretamente', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        prisma.estoque.create({
          data: {
            produto: `Produto ${i}`,
            modelo: `MOD${i}`,
            custo: '100.00',
            valor_venda: '200.00',
            qtd_minima: 5,
            garantia: '12 meses',
            qtd_inicial: 10,
            entradas: 0,
            saidas: 0,
          },
        })
      );

      const produtos = await Promise.all(promises);

      expect(produtos).toHaveLength(5);
      expect(produtos.every((p) => p.id)).toBe(true);
    });
  });
});