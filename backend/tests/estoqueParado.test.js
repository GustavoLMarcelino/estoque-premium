import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {
  calcularEstoqueParado, dataDeReferencia, diaNoFuso, diasEntre, nomeCompleto,
  LIMITE_PROMOCAO_DIAS, LIMITE_RECARGA_DIAS,
} from '../src/services/estoqueParado.js';

// ---------------------------------------------------------------------------
// Regra pura (sem banco)
// ---------------------------------------------------------------------------
const HOJE = '2026-11-10';
const sku = (id, extra = {}) => ({
  id, produto: `SKU ${id}`, marca: 'M', saldo: 1, custo: 100,
  vendaProducao: null, vendaHistorico: null, nivelHistorico: null, entrada: null, entradaManual: null, ...extra,
});

describe('dias parado = hoje − a data mais recente entre venda e entrada de compra', () => {
  it('constantes dos limites', () => {
    expect(LIMITE_PROMOCAO_DIAS).toBe(90);
    expect(LIMITE_RECARGA_DIAS).toBe(120);
  });

  it('entrada recente zera a idade, mesmo que a venda seja antiga', () => {
    const r = calcularEstoqueParado({
      hoje: HOJE, skus: [sku(1, { vendaHistorico: '2025-04-15', entrada: '2026-10-30T13:00:00Z' })],
    });
    expect(r.top[0]).toMatchObject({ dias: 11, origem: 'entrada', promocao: false, recarga: false });
  });

  it('venda mais recente que a entrada vale a venda; empate fica com a origem mais exata', () => {
    expect(dataDeReferencia({ vendaProducao: '2026-11-01', entrada: '2026-10-20' }).origem).toBe('venda_producao');
    expect(dataDeReferencia({ vendaHistorico: '2026-09-26', entrada: '2026-09-26' }).origem).toBe('venda_historico');
    expect(dataDeReferencia({ entrada: '2026-10-01', entradaManual: '2026-10-28' })).toEqual({ origem: 'entrada_manual', data: '2026-10-28' });
  });

  it('chegada manual impede o SKU de aparecer como parado', () => {
    const r = calcularEstoqueParado({
      hoje: HOJE, skus: [sku(7, { vendaHistorico: '2023-02-02', entradaManual: '2026-10-28' })],
    });
    expect(r.resumo.skusPromocao).toBe(0);
    expect(r.top[0]).toMatchObject({ dias: 13, origem: 'entrada_manual' });
  });

  it('só a venda do histórico é marcada como estimada, com o nível do casamento', () => {
    const r = calcularEstoqueParado({
      hoje: HOJE,
      skus: [sku(1, { vendaHistorico: '2026-01-01', nivelHistorico: 'grosso' }), sku(2, { vendaProducao: '2026-10-01' })],
    });
    const por = Object.fromEntries(r.top.map((i) => [i.id, i]));
    expect(por[1]).toMatchObject({ estimada: true, nivelHistorico: 'grosso' });
    expect(por[2]).toMatchObject({ estimada: false, nivelHistorico: null });
  });
});

describe('cards', () => {
  const skus = [
    sku(1, { vendaProducao: '2026-11-09', saldo: 10, custo: 50 }), // 1 dia
    sku(2, { vendaHistorico: '2026-08-12', saldo: 2, custo: 300 }), // 90 dias: NÃO é > 90
    sku(3, { vendaHistorico: '2026-08-11', saldo: 1, custo: 400 }), // 91 dias: promoção
    sku(4, { vendaHistorico: '2026-07-12', saldo: 3, custo: 100 }), // 121 dias: promoção + recarga
    sku(5, { vendaHistorico: '2025-01-01', saldo: 1, custo: 1000 }), // > 120, valor maior
    sku(6, { vendaHistorico: '2025-01-01', saldo: 1, custo: 200 }), // empata em dias com o 5
    sku(7, { saldo: 2, custo: 40 }), // nunca vendeu
    sku(8, { saldo: 0, custo: 999, vendaHistorico: '2020-01-01' }), // sem estoque: fora de tudo
  ];
  const r = calcularEstoqueParado({ hoje: HOJE, skus });

  it('só SKUs com estoque > 0 entram', () => {
    expect(r.resumo.skusComEstoque).toBe(7);
    expect(r.resumo.skusComData).toBe(6);
  });

  it('promoção é "mais de 90" e recarga "mais de 120" (limite exclusivo)', () => {
    expect(r.resumo.skusPromocao).toBe(4); // 3, 4, 5, 6
    expect(r.resumo.skusRecarga).toBe(3); // 4, 5, 6
  });

  it('valor parado soma estoque × custo só dos SKUs acima do limite; média por SKU parado', () => {
    // 3: 400 + 4: 300 + 5: 1000 + 6: 200
    expect(r.resumo.valorParado).toBe(1900);
    expect(r.resumo.valorMedioParado).toBe(475);
    expect(r.resumo.valorRecarga).toBe(1500);
  });

  it('média e mediana dos dias (só quem tem data)', () => {
    const dias = [1, 90, 91, 121, 679, 679];
    expect(r.resumo.tempoMedioDias).toBe(Math.round(dias.reduce((a, b) => a + b) / dias.length));
    expect(r.resumo.tempoMedianoDias).toBe(Math.round((91 + 121) / 2));
  });

  it('top 5: dias e, no empate, valor parado', () => {
    expect(r.top.map((i) => i.id)).toEqual([5, 6, 4, 3, 2]);
    expect(r.top).toHaveLength(5);
  });

  it('parados: lista completa acima do limite de promoção, mais antigos primeiro', () => {
    expect(r.parados).toHaveLength(r.resumo.skusPromocao);
    expect(r.parados.every((i) => i.promocao)).toBe(true);
    expect(r.parados.map((i) => i.dias)).toEqual([...r.parados.map((i) => i.dias)].sort((a, b) => b - a));
  });

  it('sem venda registrada fica separado, sem data e fora das contagens e somas', () => {
    expect(r.semVendaRegistrada).toMatchObject({ skus: 1, unidades: 2, valor: 80 });
    expect(r.semVendaRegistrada.itens[0]).toMatchObject({ id: 7 });
    expect(r.top.map((i) => i.id)).not.toContain(7);
  });
});

describe('datas', () => {
  it('dia no fuso da loja (UTC−3): 01h UTC ainda é o dia anterior em São Paulo', () => {
    expect(diaNoFuso(new Date('2026-11-09T01:00:00Z'))).toBe('2026-11-08');
    expect(diaNoFuso(new Date('2026-11-09T20:27:53Z'))).toBe('2026-11-09');
    expect(diaNoFuso('2026-09-26')).toBe('2026-09-26');
    expect(diaNoFuso(null)).toBeNull();
  });

  it('diasEntre nunca é negativo', () => {
    expect(diasEntre('2026-11-10', '2026-11-12')).toBe(0);
    expect(diasEntre('2026-11-10', '2026-11-09')).toBe(1);
  });

  it('nome completo não repete o modelo (mesma regra do script Python)', () => {
    expect(nomeCompleto('ONBAT F60DN 60AH', '60AH')).toBe('ONBAT F60DN 60AH');
    expect(nomeCompleto('Moura M60AD', '60AH')).toBe('Moura M60AD 60AH');
  });
});

// ---------------------------------------------------------------------------
// Rota (banco SQLite de teste + arquivos temporários)
// ---------------------------------------------------------------------------
const dir = mkdtempSync(path.join(tmpdir(), 'stockmind-parado-'));
const PREVISAO = path.join(dir, 'previsao.json');
const CHEGADAS = path.join(dir, 'chegadas.json');
process.env.STOCKMIND_PREVISAO_PATH = PREVISAO;
process.env.STOCKMIND_CHEGADAS_PATH = CHEGADAS;

let app; let prisma; let authAdmin; let authUser; let marcaId;
beforeAll(async () => {
  ({ app } = await import('../src/app.js'));
  ({ prisma } = await import('../src/config/prisma.js'));
  ({ authAdmin, authUser } = await import('./helpers/api.js'));
});

async function criarSku(produto, { saldo, custo, modelo = '60AH' }) {
  return prisma.estoque.create({
    data: { produto, modelo, marca_id: marcaId, custo, valor_venda: 999, qtd_minima: 0, qtd_inicial: saldo, entradas: 0, saidas: 0 },
  });
}
const mov = (produto_id, tipo, data, extra = {}) =>
  prisma.movimentacoes.create({ data: { produto_id, tipo, quantidade: 1, valor_final: 100, data_movimentacao: new Date(data), ...extra } });
const diasAtras = (n) => new Date(Date.now() - n * 86_400_000);

beforeEach(async () => {
  await prisma.movimentacoes.deleteMany();
  await prisma.garantias.deleteMany();
  await prisma.estoque.deleteMany();
  await prisma.marca.deleteMany();
  marcaId = (await prisma.marca.create({ data: { nome: 'Heliar' } })).id;
  writeFileSync(PREVISAO, JSON.stringify({ gerado_em: '2026-11-10T01:25:00+00:00', grupos: [] }));
  writeFileSync(CHEGADAS, '{}');
});

const buscar = (auth = authAdmin) => request(app).get('/api/stockmind/estoque-parado').set(auth());

describe('GET /api/stockmind/estoque-parado', () => {
  it('só admin acessa', async () => {
    expect((await buscar(authUser)).status).toBe(403);
    expect((await request(app).get('/api/stockmind/estoque-parado')).status).toBe(401);
  });

  it('junta venda de produção, histórico do JSON e entrada de compra, e ignora empréstimo de garantia', async () => {
    await criarSku('A sem entrada nem venda', { saldo: 2, custo: 100 });
    const b = await criarSku('B venda antiga no histórico', { saldo: 1, custo: 200 });
    const c = await criarSku('C venda recente na produção', { saldo: 3, custo: 10 });
    const d = await criarSku('D só empréstimo de garantia', { saldo: 1, custo: 50 });
    await criarSku('E sem estoque', { saldo: 0, custo: 999 });
    await criarSku('Terminal Bateria', { saldo: 9, custo: 5, modelo: '' });

    await mov(c.id, 'SAIDA', diasAtras(2));
    const g = await prisma.garantias.create({
      data: { cliente_nome: 'F', cliente_telefone: '1', cliente_endereco: 'R', produto_codigo: 'A', produto_descricao: 'A', estoque_id: d.id },
    });
    await mov(d.id, 'SAIDA', diasAtras(1), { garantia_id: g.id, motivo: `Empréstimo garantia #${g.id}`, valor_final: 0 });
    await mov(d.id, 'ENTRADA', diasAtras(1), { garantia_id: g.id, motivo: `Devolução empréstimo garantia #${g.id}`, valor_final: 0 });
    writeFileSync(PREVISAO, JSON.stringify({
      gerado_em: '2026-11-10T01:25:00+00:00',
      grupos: [{ skus: [{ id: b.id, ultimaVendaHistorico: '2026-01-01', ultimaVendaHistoricoNivel: 'subgrupo' }] }],
    }));

    const { status, body } = await buscar();
    expect(status).toBe(200);
    expect(body.parametros).toEqual({ limitePromocaoDias: 90, limiteRecargaDias: 120 });
    expect(body.previsaoGeradaEm).toBe('2026-11-10T01:25:00+00:00');
    // com estoque: A, B, C, D (E sem estoque e o Terminal Bateria ficam de fora)
    expect(body.resumo.skusComEstoque).toBe(4);
    // empréstimo e devolução de garantia NÃO contam: D fica sem data, igual a A
    expect(body.semVendaRegistrada).toMatchObject({ skus: 2, unidades: 3, valor: 250 });
    expect(body.top.map((i) => i.id)).toEqual([b.id, c.id]);
    expect(body.top[0]).toMatchObject({ origem: 'venda_historico', estimada: true, nivelHistorico: 'subgrupo', promocao: true, recarga: true });
    expect(body.top[1]).toMatchObject({ origem: 'venda_producao', dias: 2, promocao: false });
    expect(body.resumo.valorParado).toBe(200);
  });

  it('entrada de compra recente tira o SKU da lista de parados', async () => {
    const b = await criarSku('B', { saldo: 1, custo: 200 });
    await mov(b.id, 'ENTRADA', diasAtras(3));
    writeFileSync(PREVISAO, JSON.stringify({ grupos: [{ skus: [{ id: b.id, ultimaVendaHistorico: '2023-02-02' }] }] }));
    const { body } = await buscar();
    expect(body.top[0]).toMatchObject({ id: b.id, origem: 'entrada', promocao: false });
    expect(body.resumo.skusPromocao).toBe(0);
  });

  it('chegada manual (arquivo) vale como entrada; data inválida é ignorada', async () => {
    const x = await criarSku('X', { saldo: 1, custo: 100 });
    const y = await criarSku('Y', { saldo: 1, custo: 100 });
    const recente = diaNoFuso(diasAtras(5));
    writeFileSync(CHEGADAS, JSON.stringify({ [x.id]: recente, [y.id]: 'ontem' }));
    const { body } = await buscar();
    expect(body.top).toHaveLength(1);
    expect(body.top[0]).toMatchObject({ id: x.id, origem: 'entrada_manual', dias: 5 });
    expect(body.semVendaRegistrada.skus).toBe(1); // Y: data inválida não vira data
  });

  it('sem o JSON da previsão a rota continua respondendo (só produção e entradas)', async () => {
    const c = await criarSku('C', { saldo: 1, custo: 10 });
    await mov(c.id, 'SAIDA', diasAtras(1));
    writeFileSync(PREVISAO, 'isto não é JSON');
    const { status, body } = await buscar();
    expect(status).toBe(200);
    expect(body.previsaoGeradaEm).toBeNull();
    expect(body.top[0]).toMatchObject({ id: c.id, origem: 'venda_producao' });
  });
});
