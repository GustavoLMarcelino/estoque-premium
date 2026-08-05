import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

// GET /api/vendas-resumo?from=&to= — recorte de período.
//
// O que estes testes protegem: (1) que o filtro recorta as DUAS linhas pelo
// campo certo, (2) que SEM os parâmetros nada muda — /movimentacoes/resumo e o
// Dashboard dependem disso —, e (3) que as regras que já existiam (empréstimo
// fora, mão de obra dentro, escopo de linha, gate de custo) continuam valendo
// COM o filtro ligado, que é onde um recorte mal feito as anularia.

let marcaId;
let batId;

const DENTRO = '2026-08-10T12:00:00Z'; // dentro da janela dos testes
const FORA = '2026-01-05T12:00:00Z';   // meses antes
const JANELA = { from: '2026-08-01', to: '2026-08-31' };

const vendaBateria = (dados) =>
  prisma.movimentacoes.create({
    data: {
      produto_id: batId, tipo: 'SAIDA', quantidade: 1, valor_final: '300.00',
      forma_pagamento: 'pix', ...dados,
    },
  });

const pedidoSom = (dados) =>
  prisma.pedido_som.create({
    data: { valor_total: '500.00', forma_pagamento: 'PIX', ...dados },
  });

const buscar = (query, auth = authAdmin) =>
  request(app).get('/api/vendas-resumo').query(query).set(auth());

beforeEach(async () => {
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque_som.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.marca.deleteMany();
  marcaId = (await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } })).id;
  batId = (await prisma.estoque.create({
    data: {
      produto: 'Bateria', modelo: 'B-1', marca_id: marcaId,
      custo: '100.00', valor_venda: '300.00', qtd_minima: 1, qtd_inicial: 50, entradas: 0, saidas: 0,
    },
  })).id;
});

describe('recorte de período', () => {
  it('filtra Baterias por data_movimentacao e Som por created_at', async () => {
    await vendaBateria({ data_movimentacao: new Date(DENTRO) });
    await vendaBateria({ data_movimentacao: new Date(FORA) });
    await pedidoSom({ created_at: new Date(DENTRO) });
    await pedidoSom({ created_at: new Date(FORA) });

    const { status, body } = await buscar(JANELA);
    expect(status).toBe(200);
    expect(body.data.baterias.vendasBrutas).toBe(300); // só a de agosto
    expect(body.data.som.vendasBrutas).toBe(500);
    expect(body.data.total.vendasBrutas).toBe(800);
  });

  it('sem filtro, as MESMAS vendas somam tudo — a diferença é só o recorte', async () => {
    await vendaBateria({ data_movimentacao: new Date(DENTRO) });
    await vendaBateria({ data_movimentacao: new Date(FORA) });

    const comFiltro = (await buscar(JANELA)).body.data.total.vendasBrutas;
    const semFiltro = (await buscar({})).body.data.total.vendasBrutas;
    expect(comFiltro).toBe(300);
    expect(semFiltro).toBe(600);
  });

  it('to inclui o DIA INTEIRO (uma venda às 23h de to continua dentro)', async () => {
    await vendaBateria({ data_movimentacao: new Date('2026-08-31T23:30:00Z') });

    const { body } = await buscar({ from: '2026-08-01', to: '2026-08-31' });
    expect(body.data.baterias.vendasBrutas).toBe(300);
  });

  it('só from (sem to) recorta daquela data em diante', async () => {
    await vendaBateria({ data_movimentacao: new Date(DENTRO) });
    await vendaBateria({ data_movimentacao: new Date(FORA) });

    const { body } = await buscar({ from: '2026-08-01' });
    expect(body.data.baterias.vendasBrutas).toBe(300);
  });

  it('só to (sem from) recorta até aquela data', async () => {
    await vendaBateria({ data_movimentacao: new Date(DENTRO) });
    await vendaBateria({ data_movimentacao: new Date(FORA) });

    const { body } = await buscar({ to: '2026-06-30' });
    expect(body.data.baterias.vendasBrutas).toBe(300); // a de janeiro
  });

  it('aceita ISO completo, não só YYYY-MM-DD (é como a Home chama)', async () => {
    await vendaBateria({ data_movimentacao: new Date('2026-08-10T18:00:00Z') });
    await vendaBateria({ data_movimentacao: new Date('2026-08-10T06:00:00Z') });

    const { body } = await buscar({ from: '2026-08-10T12:00:00.000Z', to: '2026-08-10T23:59:59.999Z' });
    expect(body.data.baterias.vendasBrutas).toBe(300); // só a das 18h
  });

  it('a série por dia também respeita o recorte', async () => {
    await vendaBateria({ data_movimentacao: new Date(DENTRO) });
    await vendaBateria({ data_movimentacao: new Date(FORA) });

    const { body } = await buscar(JANELA);
    expect(body.data.baterias.seriePorDia).toEqual([{ dia: '2026-08-10', receita: 300 }]);
  });

  it('período sem nenhuma venda devolve zeros, não erro', async () => {
    await vendaBateria({ data_movimentacao: new Date(FORA) });

    const { status, body } = await buscar(JANELA);
    expect(status).toBe(200);
    expect(body.data.total.vendasBrutas).toBe(0);
    expect(body.data.total.qtdVendas).toBe(0);
    expect(body.data.baterias.seriePorDia).toEqual([]);
  });

  it('saídas de Som sem pedido também são recortadas pelo período', async () => {
    const som = await prisma.estoque_som.create({
      data: {
        produto: 'Falante', modelo: 'F-1', marca_id: marcaId,
        custo: '50.00', valor_venda: '150.00', qtd_minima: 1, qtd_inicial: 20, entradas: 0, saidas: 0,
      },
    });
    await prisma.movimentacoes_som.createMany({
      data: [
        { produto_id: som.id, tipo: 'SAIDA', quantidade: 4, valor_final: '150.00', data_movimentacao: new Date(DENTRO) },
        { produto_id: som.id, tipo: 'SAIDA', quantidade: 9, valor_final: '150.00', data_movimentacao: new Date(FORA) },
      ],
    });

    const { body } = await buscar(JANELA);
    expect(body.data.som.saidasSemPedido.movimentacoes).toBe(1);
    expect(body.data.som.saidasSemPedido.unidades).toBe(4);
  });
});

/* ── as regras de sempre continuam valendo COM o filtro ligado ───────────── */

describe('regras existentes sob o filtro de período', () => {
  it('empréstimo de garantia DENTRO do período continua fora da receita', async () => {
    const g = await prisma.garantias.create({
      data: {
        cliente_nome: 'Fulano', cliente_documento: '1', cliente_telefone: '1', cliente_endereco: 'Rua 1',
        produto_codigo: 'B-1', produto_descricao: 'Bateria', estoque_id: batId,
        data_abertura: new Date(DENTRO),
      },
    });
    await vendaBateria({ data_movimentacao: new Date(DENTRO) });                       // venda real
    await vendaBateria({ data_movimentacao: new Date(DENTRO), valor_final: '0.00', garantia_id: g.id });

    const { body } = await buscar(JANELA);
    expect(body.data.baterias.vendasBrutas).toBe(300); // só a venda
    expect(body.data.baterias.qtdVendas).toBe(1);      // o empréstimo não conta unidade
  });

  it('mão de obra de Som entra na soma do período (é valor_total, não só a peça)', async () => {
    const som = await prisma.estoque_som.create({
      data: {
        produto: 'Módulo', modelo: 'M-1', marca_id: marcaId,
        custo: '200.00', valor_venda: '600.00', qtd_minima: 1, qtd_inicial: 10, entradas: 0, saidas: 0,
      },
    });
    const pedido = await pedidoSom({
      valor_total: '1100.00', valor_mao_obra: '500.00', created_at: new Date(DENTRO),
    });
    await prisma.pedido_som_item.createMany({
      data: [
        { pedido_id: pedido.id, tipo: 'PRODUTO', produto_id: som.id, descricao: 'Módulo', quantidade: 1, valor_unit: '600.00', valor_total: '600.00', baixa_estoque: true },
        { pedido_id: pedido.id, tipo: 'MAO_OBRA', descricao: 'Instalação', quantidade: 1, valor_unit: '0.00', valor_total: '0.00', mao_obra_unit: '500.00', mao_obra_total: '500.00', baixa_estoque: false },
      ],
    });

    const { body } = await buscar(JANELA);
    expect(body.data.som.vendasBrutas).toBe(1100); // peça 600 + mão de obra 500
    expect(body.data.som.receitaMaoObra).toBe(500);
    expect(body.data.total.vendasBrutas).toBe(1100);
  });

  async function usuarioCom(permissoes) {
    const email = `periodo-${Math.random().toString(36).slice(2)}@teste.local`;
    const u = await prisma.user.create({
      data: { name: 'Periodo', email, password: 'x', role: 'user', permissoes: JSON.stringify(permissoes) },
    });
    const token = jwt.sign({ id: u.id, email, role: 'user' }, process.env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '1h',
    });
    return () => ({ Authorization: `Bearer ${token}` });
  }

  it('escopo de linha continua valendo com o filtro', async () => {
    await vendaBateria({ data_movimentacao: new Date(DENTRO) });
    await pedidoSom({ created_at: new Date(DENTRO) });

    const auth = await usuarioCom({ dashboards: true, linha_som: true });
    const { body } = await buscar(JANELA, auth);
    expect(body.data.baterias).toBeNull();
    expect(body.data.som.vendasBrutas).toBe(500);
    expect(body.data.total.vendasBrutas).toBe(500);
  });

  it('sem ver_custo o filtro não abre brecha: custo e lucro seguem ausentes', async () => {
    await vendaBateria({ data_movimentacao: new Date(DENTRO) });

    const auth = await usuarioCom({ dashboards: true, linha_baterias: true, linha_som: true });
    const { body } = await buscar(JANELA, auth);
    for (const bloco of [body.data.total, body.data.baterias, body.data.som]) {
      expect(bloco.custoVendido).toBeUndefined();
      expect(bloco.lucroBruto).toBeUndefined();
      expect(bloco.lucroLiquido).toBeUndefined();
    }
    expect(body.data.baterias.vendasBrutas).toBe(300); // receita segue visível
  });
});

/* ── validação: parâmetro ruim falha ALTO, não em silêncio ──────────────── */

describe('validação dos parâmetros', () => {
  it('data inválida devolve 400 nomeando o campo', async () => {
    const { status, body } = await buscar({ from: 'ontem' });
    expect(status).toBe(400);
    expect(body.message).toMatch(/from/);
    expect(body.message).toMatch(/data inválida/i);
  });

  // new Date('10/08/2026') NÃO falha: resolve como 8 de outubro, formato
  // americano. Quem digitou 10 de agosto receberia o mês errado sem aviso —
  // por isso o formato é exigido por regex, não entregue ao Date.
  it('data em DD/MM/AAAA é REJEITADA, não reinterpretada como mês/dia', async () => {
    const { status } = await buscar({ from: '10/08/2026' });
    expect(status).toBe(400);
  });

  it('data com mês/dia impossível também é 400', async () => {
    expect((await buscar({ from: '2026-13-45' })).status).toBe(400);
    expect((await buscar({ to: '2026-02-30T99:00:00Z' })).status).toBe(400);
  });

  it('from depois de to devolve 400', async () => {
    const { status, body } = await buscar({ from: '2026-08-31', to: '2026-08-01' });
    expect(status).toBe(400);
    expect(body.message).toMatch(/depois de to/);
  });

  it('parâmetro desconhecido devolve 400 em vez de agregar tudo em silêncio', async () => {
    // "form" em vez de "from": sem o .strict() isto responderia 200 com o
    // histórico INTEIRO, com cara de resumo da semana.
    await vendaBateria({ data_movimentacao: new Date(FORA) });
    const { status } = await buscar({ form: '2026-08-01' });
    expect(status).toBe(400);
  });
});

/* ── não-regressão: sem parâmetros, nada muda ───────────────────────────── */

describe('sem from/to o payload é o de antes', () => {
  beforeEach(async () => {
    await prisma.movimentacoes.createMany({
      data: [
        { produto_id: batId, tipo: 'SAIDA', quantidade: 2, valor_final: '230.00', forma_pagamento: 'credito', parcelas: 10, data_movimentacao: new Date('2026-08-01T12:00:00Z') },
        { produto_id: batId, tipo: 'SAIDA', quantidade: 1, valor_final: '200.00', forma_pagamento: 'pix', data_movimentacao: new Date('2026-08-02T12:00:00Z') },
      ],
    });
  });

  it('/vendas-resumo sem query == /movimentacoes/resumo no bloco baterias', async () => {
    const semQuery = await request(app).get('/api/vendas-resumo').set(authAdmin());
    const antigo = await request(app).get('/api/movimentacoes/resumo').set(authAdmin());

    expect(semQuery.status).toBe(200);
    expect(semQuery.body.data.baterias).toEqual(antigo.body.data);
  });

  it('query vazia ({}) é idêntica a não mandar query nenhuma', async () => {
    const vazia = await buscar({});
    const nenhuma = await request(app).get('/api/vendas-resumo').set(authAdmin());
    expect(vazia.body).toEqual(nenhuma.body);
  });

  it('/movimentacoes/resumo segue agregando TUDO, ignorando qualquer período', async () => {
    // a rota antiga não expõe filtro; mandar from nela não pode recortar nada
    const comLixo = await request(app).get('/api/movimentacoes/resumo?from=2030-01-01').set(authAdmin());
    const limpo = await request(app).get('/api/movimentacoes/resumo').set(authAdmin());
    expect(comLixo.body.data).toEqual(limpo.body.data);
    expect(limpo.body.data.vendasBrutas).toBe(660);
  });
});
