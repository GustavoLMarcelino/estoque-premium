import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

// M2: produtos de Som não têm mais classe; classe só existe para Insulfilme.
// Cenário com NENHUMA classe de Som no banco — prova que:
//  - mão de obra de Som entra por "Outro (valor manual)" e cai na base 30%;
//  - Insulfilme (classe) cai em valor_mao_obra_insulfilme a 25%;
//  - a rota de produto ignora classe_id no body (criar e editar não quebram).

let marcaId;
let insulfId;

beforeEach(async () => {
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.classe_som.deleteMany(); // zera TUDO — nenhuma classe de Som existe
  marcaId = (await prisma.marca.upsert({ where: { nome: 'Pioneer' }, update: {}, create: { nome: 'Pioneer' } })).id;
  // única classe do banco = Insulfilme
  insulfId = (
    await prisma.classe_som.create({
      data: { nome: 'Insulfilme Padrão', valor_mao_obra: '380.00', categoria: 'INSULFILME' },
    })
  ).id;
});

const criarPedido = (itens) =>
  request(app).post('/api/pedido-som').set(authAdmin()).send({ veiculo: 'Gol', forma_pagamento: 'pix', itens });

describe('M2 — Som sem classe: chaveamento de comissão por categoria', () => {
  it('mão de obra de Som via "Outro (valor manual)" cai na base 30% (não Insulfilme)', async () => {
    const res = await criarPedido([
      { tipo: 'MAO_OBRA', descricao: 'Instalação de alarme', valor_unit: 300 },
    ]);
    expect(res.status).toBe(201);
    const p = res.body.data;
    expect(Number(p.valor_mao_obra)).toBe(300);
    expect(p.valor_mao_obra_insulfilme).toBeNull(); // nada de Insulfilme
    expect(Number(p.comissao_joel)).toBe(90); // 300 × 30%
  });

  it('serviço de Insulfilme cai em valor_mao_obra_insulfilme a 25%', async () => {
    const res = await criarPedido([{ tipo: 'MAO_OBRA', classe_id: insulfId, quantidade: 1 }]);
    expect(res.status).toBe(201);
    const p = res.body.data;
    expect(Number(p.valor_mao_obra)).toBe(380);
    expect(Number(p.valor_mao_obra_insulfilme)).toBe(380);
    expect(Number(p.comissao_joel)).toBe(95); // 380 × 25%
    // Insulfilme mantém o vínculo de classe no item (comissão 25% depende disso)
    expect(p.itens[0].classe_id).toBe(insulfId);
  });

  it('misto: Som manual (30%) + Insulfilme (25%) → comissão blended, com classes de Som ausentes', async () => {
    const res = await criarPedido([
      { tipo: 'MAO_OBRA', descricao: 'Mão de obra som', valor_unit: 200 }, // Som 30%
      { tipo: 'MAO_OBRA', classe_id: insulfId, quantidade: 1 },            // Insulfilme 25%
    ]);
    expect(res.status).toBe(201);
    const p = res.body.data;
    expect(Number(p.valor_mao_obra)).toBe(580); // 200 + 380
    expect(Number(p.valor_mao_obra_insulfilme)).toBe(380);
    // base Som = 580 − 380 = 200 → 200×30% + 380×25% = 60 + 95 = 155
    expect(Number(p.comissao_joel)).toBe(155);
    // confirma o cenário: nenhuma classe de Som existe no banco
    expect(await prisma.classe_som.count({ where: { categoria: 'SOM' } })).toBe(0);
  });
});

describe('M2 — produto de Som pela rota ignora classe_id', () => {
  const criarProduto = (body) => request(app).post('/api/estoque-som').set(authAdmin()).send(body);
  const baseProduto = {
    marca_id: undefined, // preenchido no teste
    custo: '80.00', valor_venda: '150.00', valor_vista: '150.00', valor_parcelado: '160.00',
    qtd_minima: 1, qtd_inicial: 5,
  };

  it('cria produto de Som sem classe_id (fluxo normal)', async () => {
    const res = await criarProduto({ ...baseProduto, produto: 'Alto-falante', modelo: 'AF-6', marca_id: marcaId });
    expect(res.status).toBe(201);
    expect(res.body.classe_id).toBeNull();
  });

  it('enviar classe_id no body NÃO quebra e é ignorado (produto criado sem classe)', async () => {
    const res = await criarProduto({
      ...baseProduto, produto: 'Módulo', modelo: 'MD-1', marca_id: marcaId, classe_id: insulfId,
    });
    expect(res.status).toBe(201);
    expect(res.body.classe_id).toBeNull(); // ignorado
    const salvo = await prisma.estoque_som.findUnique({ where: { id: res.body.id } });
    expect(salvo.classe_id).toBeNull();
  });

  it('editar produto enviando classe_id NÃO quebra e é ignorado', async () => {
    const criado = await criarProduto({ ...baseProduto, produto: 'Central', modelo: 'C-1', marca_id: marcaId });
    const id = criado.body.id;
    const res = await request(app).put(`/api/estoque-som/${id}`).set(authAdmin())
      .send({ classe_id: insulfId, produto: 'Central Editada' });
    expect(res.status).toBe(200);
    const salvo = await prisma.estoque_som.findUnique({ where: { id } });
    expect(salvo.classe_id).toBeNull();
    expect(salvo.produto).toBe('Central Editada');
  });
});
