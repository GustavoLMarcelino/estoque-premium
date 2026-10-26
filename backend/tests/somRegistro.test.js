import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import process from 'node:process';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin, authUser } from './helpers/api.js';
import { blocoDoIntervalo, diaBRT, somaDias } from '../src/services/registroSom.js';

let produtoId;

beforeEach(async () => {
  await prisma.pedido_som_item.deleteMany();
  await prisma.pedido_som.deleteMany();
  await prisma.movimentacoes_som.deleteMany();
  await prisma.estoque_som.deleteMany();
  const marca = await prisma.marca.upsert({ where: { nome: 'Acdelco' }, update: {}, create: { nome: 'Acdelco' } });
  produtoId = (
    await prisma.estoque_som.create({
      data: {
        produto: 'Alto-falante', modelo: 'AF-6', marca_id: marca.id, custo: '80.00', valor_venda: '150.00',
        qtd_minima: 1, qtd_inicial: 100, entradas: 0, saidas: 0,
      },
    })
  ).id;
});

const get = (qs, auth = authAdmin()) => request(app).get(`/api/som/registro?${qs}`).set(auth);

/** Pedido com mão de obra (Joel) e, se pedido, um produto + a movimentação filha. */
async function pedido({ em, veiculo = 'Gol', maoObra = 100, pct = 30, comProduto = false }) {
  const p = await prisma.pedido_som.create({
    data: {
      veiculo, valor_total: String(maoObra), valor_mao_obra: String(maoObra),
      comissao_joel: String((maoObra * pct) / 100), forma_pagamento: 'pix', created_at: new Date(em),
    },
  });
  await prisma.pedido_som_item.create({
    data: {
      pedido_id: p.id, tipo: 'MAO_OBRA', descricao: 'Instalação', quantidade: 1,
      valor_unit: '0', valor_total: '0', mao_obra_unit: String(maoObra), mao_obra_total: String(maoObra),
      percentual_comissao: String(pct),
    },
  });
  if (comProduto) {
    await prisma.pedido_som_item.create({
      data: {
        pedido_id: p.id, tipo: 'PRODUTO', produto_id: produtoId, descricao: 'Alto-falante - AF-6',
        quantidade: 2, valor_unit: '150', valor_total: '300', baixa_estoque: true,
      },
    });
    await mov({ tipo: 'SAIDA', em, motivo: `Pedido Som #${p.id}`, valor: 150, qtd: 2 });
  }
  return p;
}

const mov = ({ tipo = 'SAIDA', em, motivo = null, valor = 0, qtd = 1 }) =>
  prisma.movimentacoes_som.create({
    data: {
      produto_id: produtoId, tipo, quantidade: qtd, valor_final: String(valor),
      motivo, data_movimentacao: new Date(em),
    },
  });

const todasLinhas = (body) => body.dias.flatMap((d) => d.linhas);

describe('GET /api/som/registro — agrupamento por dia (Brasília)', () => {
  it('23:30 local cai no dia local, não no dia UTC; 00:00 local abre o dia seguinte', async () => {
    // 21/10 02:30Z = 20/10 23:30 BRT · 21/10 03:00Z = 21/10 00:00 BRT
    await pedido({ em: '2026-10-21T02:30:00Z', veiculo: 'Tarde' });
    await pedido({ em: '2026-10-21T03:00:00Z', veiculo: 'Cedo' });
    const res = await get('de=2026-10-20&ate=2026-10-21');
    expect(res.status).toBe(200);
    expect(res.body.dias.map((d) => d.data)).toEqual(['2026-10-21', '2026-10-20']);
    expect(res.body.dias[0].linhas[0].pedido.veiculo).toBe('Cedo');
    expect(res.body.dias[1].linhas[0].pedido.veiculo).toBe('Tarde');
  });

  it('o intervalo respeita os limites em Brasília (23:59 BRT entra, 00:00 BRT do dia seguinte não)', async () => {
    await pedido({ em: '2026-10-21T02:59:59Z', veiculo: 'Dentro' }); // 20/10 23:59:59 BRT
    await pedido({ em: '2026-10-21T03:00:00Z', veiculo: 'Fora' }); // 21/10 00:00 BRT
    const res = await get('de=2026-10-20&ate=2026-10-20');
    expect(todasLinhas(res.body).map((l) => l.pedido.veiculo)).toEqual(['Dentro']);
  });

  it('dias sem linha não aparecem; linhas ordenadas por data desc, sem depender do id', async () => {
    const a = await pedido({ em: '2026-10-20T12:00:00Z', veiculo: 'Antigo-id-baixo' });
    const b = await pedido({ em: '2026-10-20T18:00:00Z', veiculo: 'Novo' });
    // id maior, mas data mais antiga: ordenar por id inverteria a lista
    await mov({ tipo: 'ENTRADA', em: '2026-10-20T10:00:00Z' });
    expect(b.id).toBeGreaterThan(a.id);
    const res = await get('de=2026-10-15&ate=2026-10-25');
    expect(res.body.dias).toHaveLength(1);
    const ordem = res.body.dias[0].linhas.map((l) => (l.kind === 'pedido' ? l.pedido.veiculo : 'entrada'));
    expect(ordem).toEqual(['Novo', 'Antigo-id-baixo', 'entrada']);
  });

  it('resumo do dia: nº de pedidos, total e comissão (movimentações não entram)', async () => {
    await pedido({ em: '2026-10-20T15:00:00Z', maoObra: 100, pct: 30 });
    await pedido({ em: '2026-10-20T16:00:00Z', maoObra: 200, pct: 25 });
    await mov({ tipo: 'SAIDA', em: '2026-10-20T17:00:00Z', valor: 80 });
    const res = await get('de=2026-10-20&ate=2026-10-20');
    expect(res.body.dias[0].resumo).toEqual({ pedidos: 2, total: 300, comissao: 80 }); // 30 + 50
  });
});

describe('GET /api/som/registro — filhas, órfãs e filtros', () => {
  it('esconde a saída gerada por pedido existente (o pedido já a representa)', async () => {
    const p = await pedido({ em: '2026-10-20T15:00:00Z', comProduto: true });
    const res = await get('de=2026-10-20&ate=2026-10-20');
    const linhas = todasLinhas(res.body);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].kind).toBe('pedido');
    expect(linhas[0].pedido.id).toBe(p.id);
    expect(linhas[0].pedido.itens).toHaveLength(2);
  });

  it('movimentação com motivo de pedido que não existe volta como avulsa órfã', async () => {
    await mov({ tipo: 'SAIDA', em: '2026-10-20T15:00:00Z', motivo: 'Pedido Som #99999', valor: 50, qtd: 2 });
    await mov({ tipo: 'SAIDA', em: '2026-10-20T16:00:00Z', valor: 10 });
    const res = await get('de=2026-10-20&ate=2026-10-20');
    const movs = todasLinhas(res.body).map((l) => l.mov);
    expect(movs).toHaveLength(2);
    const orfa = movs.find((m) => m.valor === 100);
    expect(orfa.orfa).toBe(true);
    expect(movs.find((m) => m.valor === 10).orfa).toBe(false);
  });

  it('valor da movimentação = valor_final (unitário) × quantidade', async () => {
    await mov({ tipo: 'SAIDA', em: '2026-10-20T15:00:00Z', valor: 25.5, qtd: 4 });
    const res = await get('de=2026-10-20&ate=2026-10-20');
    const m = todasLinhas(res.body)[0].mov;
    expect(m).toMatchObject({ valor_unitario: 25.5, quantidade: 4, valor: 102, produto: 'Alto-falante', modelo: 'AF-6' });
  });

  describe('filtros', () => {
    beforeEach(async () => {
      await pedido({ em: '2026-10-20T15:00:00Z', comProduto: true });
      await mov({ tipo: 'ENTRADA', em: '2026-10-20T14:00:00Z' });
      await mov({ tipo: 'SAIDA', em: '2026-10-20T13:00:00Z', valor: 0 });
      await mov({ tipo: 'SAIDA', em: '2026-10-20T12:00:00Z', motivo: 'Pedido Som #88888', valor: 5 });
    });
    const kinds = async (filtro) => {
      const res = await get(`de=2026-10-20&ate=2026-10-20&filtro=${filtro}`);
      expect(res.status).toBe(200);
      return todasLinhas(res.body).map((l) => (l.kind === 'pedido' ? 'pedido' : `${l.mov.tipo}${l.mov.orfa ? '-orfa' : ''}`));
    };

    it('tudo', async () => expect(await kinds('tudo')).toEqual(['pedido', 'ENTRADA', 'SAIDA', 'SAIDA-orfa']));
    it('pedidos: só pedidos', async () => expect(await kinds('pedidos')).toEqual(['pedido']));
    it('entradas: só ENTRADA avulsa', async () => expect(await kinds('entradas')).toEqual(['ENTRADA']));
    it('avulsas: só SAÍDA avulsa, incluindo órfã', async () => expect(await kinds('avulsas')).toEqual(['SAIDA', 'SAIDA-orfa']));
    it('filtro desconhecido → 400', async () => {
      const res = await get('de=2026-10-20&ate=2026-10-20&filtro=xyz');
      expect(res.status).toBe(400);
    });
  });

  it('q: movimentações por produto/modelo; pedidos por veículo ou descrição de item', async () => {
    await pedido({ em: '2026-10-20T15:00:00Z', veiculo: 'Mobi' });
    await pedido({ em: '2026-10-20T16:00:00Z', veiculo: 'Gol' });
    await mov({ tipo: 'ENTRADA', em: '2026-10-20T14:00:00Z' });
    const base = 'de=2026-10-20&ate=2026-10-20';

    let res = await get(`${base}&q=mobi`);
    expect(todasLinhas(res.body).map((l) => l.kind)).toEqual(['pedido']);
    expect(res.body.resumoPeriodo.pedidos).toBe(1);

    res = await get(`${base}&q=Instala`); // descrição do item MAO_OBRA
    expect(todasLinhas(res.body).filter((l) => l.kind === 'pedido')).toHaveLength(2);

    res = await get(`${base}&q=AF-6`); // modelo do produto → só a movimentação
    expect(todasLinhas(res.body).map((l) => l.kind)).toEqual(['mov']);

    res = await get(`${base}&q=naoexiste`);
    expect(res.body.dias).toEqual([]);
  });
});

describe('GET /api/som/registro — não-admin', () => {
  it('remove comissão e mão de obra do pedido e do resumo (mesma sanitização do GET /pedido-som)', async () => {
    await pedido({ em: '2026-10-20T15:00:00Z', maoObra: 100, pct: 30 });
    const res = await get('de=2026-10-20&ate=2026-10-20', authUser());
    expect(res.status).toBe(200);
    const p = res.body.dias[0].linhas[0].pedido;
    expect(p).not.toHaveProperty('comissao_joel');
    expect(p).not.toHaveProperty('valor_mao_obra');
    expect(p).not.toHaveProperty('valor_mao_obra_insulfilme');
    for (const it of p.itens) {
      expect(it).not.toHaveProperty('mao_obra_unit');
      expect(it).not.toHaveProperty('mao_obra_total');
      expect(it).not.toHaveProperty('percentual_comissao');
    }
    expect(res.body.dias[0].resumo).toEqual({ pedidos: 1, total: 100 });
    expect(res.body.resumoPeriodo).toEqual({ pedidos: 1, total: 100 });
    expect(JSON.stringify(res.body)).not.toMatch(/comissao/);
    // total do dia continua certo: usa valor_total, que o não-admin enxerga
    expect(p).toHaveProperty('valor_total');
  });

  it('admin recebe comissão e periodo_fechado no pedido', async () => {
    await pedido({ em: '2026-10-20T15:00:00Z', maoObra: 100, pct: 30 });
    const res = await get('de=2026-10-20&ate=2026-10-20');
    const p = res.body.dias[0].linhas[0].pedido;
    expect(Number(p.comissao_joel)).toBe(30);
    expect(p.periodo_fechado).toBe(false);
    expect(res.body.resumoPeriodo).toEqual({ pedidos: 1, total: 100, comissao: 30 });
  });

  it('sem a permissão reg_movimentacao → 403; sem a linha som → 403', async () => {
    const sign = (id) => ({
      Authorization: `Bearer ${jwt.sign({ id, email: `u${id}@t.local`, role: 'user' }, process.env.JWT_SECRET, { algorithm: 'HS256' })}`,
    });
    await prisma.user.createMany({
      data: [
        { id: 3, name: 'Sem tela', email: 'u3@t.local', password: 'x', role: 'user', permissoes: JSON.stringify({ linha_som: true }) },
        { id: 4, name: 'Sem linha', email: 'u4@t.local', password: 'x', role: 'user', permissoes: JSON.stringify({ reg_movimentacao: true, linha_baterias: true }) },
      ],
    });
    expect((await get('de=2026-10-20&ate=2026-10-20', sign(3))).status).toBe(403);
    expect((await get('de=2026-10-20&ate=2026-10-20', sign(4))).status).toBe(403);
    expect((await request(app).get('/api/som/registro')).status).toBe(401);
  });
});

describe('GET /api/som/registro — validação', () => {
  it.each([
    ['de depois de ate', 'de=2026-10-21&ate=2026-10-20'],
    ['data inexistente', 'de=2026-02-30&ate=2026-03-02'],
    ['formato errado', 'de=20/10/2026&ate=21/10/2026'],
    ['ate lixo', 'de=2026-10-20&ate=amanha'],
    ['intervalo gigante', 'de=2020-01-01&ate=2026-10-20'],
  ])('%s → 400', async (_n, qs) => {
    const res = await get(qs);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
  });

  it('de == ate é válido; sem parâmetros usa os 7 dias até hoje (Brasília)', async () => {
    expect((await get('de=2026-10-20&ate=2026-10-20')).status).toBe(200);
    await pedido({ em: new Date(Date.now() - 3600_000).toISOString(), veiculo: 'Recente' });
    const res = await request(app).get('/api/som/registro').set(authAdmin());
    expect(res.status).toBe(200);
    expect(res.body.proximoAte).toBeNull();
    expect(todasLinhas(res.body).map((l) => l.pedido.veiculo)).toEqual(['Recente']);
  });
});

describe('GET /api/som/registro — blocos de 31 dias e resumoPeriodo', () => {
  it('helpers: bloco = 31 dias mais recentes; proximoAte = dia anterior ou null', () => {
    expect(blocoDoIntervalo('2026-10-01', '2026-10-31')).toEqual({ blocoDe: '2026-10-01', proximoAte: null });
    expect(blocoDoIntervalo('2026-09-30', '2026-10-31')).toEqual({ blocoDe: '2026-10-01', proximoAte: '2026-09-30' });
    expect(somaDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(diaBRT(new Date('2026-10-21T02:30:00Z'))).toBe('2026-10-20');
  });

  it('intervalo <= 31 dias: um bloco só, proximoAte null', async () => {
    await pedido({ em: '2026-10-01T15:00:00Z' });
    await pedido({ em: '2026-10-31T15:00:00Z' });
    const res = await get('de=2026-10-01&ate=2026-10-31');
    expect(res.body.proximoAte).toBeNull();
    expect(res.body.dias.map((d) => d.data)).toEqual(['2026-10-31', '2026-10-01']);
  });

  it('intervalo > 31 dias: 2 blocos encadeados por proximoAte; resumoPeriodo = soma de todos os blocos', async () => {
    // 45 dias: 2026-09-17 .. 2026-10-31. Um pedido por dia, de R$ (dia) cada.
    let esperadoTotal = 0;
    let esperadoComissao = 0;
    for (let i = 0; i < 45; i++) {
      const dia = somaDias('2026-09-17', i);
      const valor = 100 + i;
      esperadoTotal += valor;
      esperadoComissao += valor * 0.3;
      await pedido({ em: `${dia}T15:00:00Z`, maoObra: valor, pct: 30 });
    }
    // avulsa e entrada no meio não entram no resumo de pedidos
    await mov({ tipo: 'SAIDA', em: '2026-10-05T15:00:00Z', valor: 10 });

    const de = '2026-09-17';
    const b1 = (await get(`de=${de}&ate=2026-10-31`)).body;
    expect(b1.dias).toHaveLength(31);
    expect(b1.dias[0].data).toBe('2026-10-31');
    expect(b1.dias.at(-1).data).toBe('2026-10-01');
    expect(b1.proximoAte).toBe('2026-09-30');

    const b2 = (await get(`de=${de}&ate=${b1.proximoAte}`)).body;
    expect(b2.dias).toHaveLength(14);
    expect(b2.dias[0].data).toBe('2026-09-30');
    expect(b2.dias.at(-1).data).toBe('2026-09-17');
    expect(b2.proximoAte).toBeNull();

    const blocos = [...b1.dias, ...b2.dias];
    const somaDosDias = {
      pedidos: blocos.reduce((s, d) => s + d.resumo.pedidos, 0),
      total: blocos.reduce((s, d) => s + d.resumo.total, 0),
      comissao: blocos.reduce((s, d) => s + d.resumo.comissao, 0),
    };
    expect(somaDosDias.pedidos).toBe(45);
    // resumoPeriodo cobre de..ate DA CHAMADA: a primeira (intervalo inteiro) é a
    // que o front guarda; a de continuação cobre só de..proximoAte.
    expect(b2.resumoPeriodo.pedidos).toBe(b2.dias.reduce((s, d) => s + d.resumo.pedidos, 0));
    expect(b1.resumoPeriodo.pedidos).toBe(somaDosDias.pedidos);
    expect(b1.resumoPeriodo.total).toBeCloseTo(somaDosDias.total, 2);
    expect(b1.resumoPeriodo.comissao).toBeCloseTo(somaDosDias.comissao, 2);
    expect(b1.resumoPeriodo.total).toBeCloseTo(esperadoTotal, 2);
    expect(b1.resumoPeriodo.comissao).toBeCloseTo(esperadoComissao, 2);
  });

  it('resumoPeriodo respeita filtro: entradas/avulsas não têm pedidos', async () => {
    await pedido({ em: '2026-10-20T15:00:00Z' });
    await mov({ tipo: 'ENTRADA', em: '2026-10-20T14:00:00Z' });
    const res = await get('de=2026-10-20&ate=2026-10-20&filtro=entradas');
    expect(res.body.resumoPeriodo).toEqual({ pedidos: 0, total: 0, comissao: 0 });
    const ped = await get('de=2026-10-20&ate=2026-10-20&filtro=pedidos');
    expect(ped.body.resumoPeriodo.pedidos).toBe(1);
  });
});
