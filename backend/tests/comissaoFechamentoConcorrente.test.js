import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { authAdmin } from './helpers/api.js';

// O fechamento de períodos é preguiçoso: GET /api/comissao/painel confere se o
// período anterior já tem snapshot (findFirst) e, se não, cria (create). Dois
// acessos ao mesmo tempo liam "não existe" os dois e gravavam o MESMO período
// duas vezes (com itens em dobro). Agora data_inicio é UNIQUE e o create que
// perde a corrida (P2002) é engolido: o período fica uma vez só e o usuário não
// vê erro.

let produtoId;

beforeEach(async () => {
  await prisma.comissao_periodo_item.deleteMany();
  await prisma.comissao_periodo.deleteMany();
  await prisma.comissao_config.deleteMany();
  await prisma.movimentacoes.deleteMany();
  await prisma.estoque.deleteMany();
  const marca = await prisma.marca.upsert({ where: { nome: 'Moura' }, update: {}, create: { nome: 'Moura' } });
  produtoId = (await prisma.estoque.create({
    data: {
      produto: 'Bateria 60Ah', modelo: 'M60GD', marca_id: marca.id, custo: '200.00', valor_venda: '400.00',
      qtd_minima: 1, qtd_inicial: 200, entradas: 0, saidas: 0,
    },
  })).id;
  // Venda de ~40 dias atrás: obriga o fechamento de 2-3 quinzenas passadas.
  await prisma.movimentacoes.create({
    data: {
      estoque: { connect: { id: produtoId } }, tipo: 'SAIDA', quantidade: 1, valor_final: '400.00',
      vendedor: 'Gustavo', data_movimentacao: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    },
  });
});

let restaurar;
afterEach(() => restaurar?.());

/** Faz as duas requisições lerem "não existe" ANTES de qualquer uma gravar —
 *  o que o MySQL permite e o SQLite, sozinho, nem sempre reproduz. O 1º
 *  findFirst de cada requisição espera o da outra; sem a outra, solta em 300ms. */
function sincronizarPrimeiraLeitura() {
  const original = prisma.comissao_periodo.findFirst.bind(prisma.comissao_periodo);
  let chegadas = 0;
  let liberar;
  const portao = new Promise((r) => { liberar = r; });
  const espia = vi.spyOn(prisma.comissao_periodo, 'findFirst').mockImplementation(async (args) => {
    const resultado = await original(args);
    if (chegadas < 2) {
      chegadas += 1;
      if (chegadas === 2) liberar();
      await Promise.race([portao, new Promise((r) => setTimeout(r, 300))]);
    }
    return resultado;
  });
  restaurar = () => espia.mockRestore();
}

const painel = () => request(app).get('/api/comissao/painel').set(authAdmin());

describe('fechamento preguiçoso com dois acessos simultâneos', () => {
  it('duas aberturas do painel → as duas 200, e cada período existe UMA vez', async () => {
    sincronizarPrimeiraLeitura();

    const resps = await Promise.all([painel(), painel()]);

    expect(resps.map((r) => r.status)).toEqual([200, 200]);
    const periodos = await prisma.comissao_periodo.findMany({ include: { itens: true } });
    expect(periodos.length).toBeGreaterThanOrEqual(2);
    const inicios = periodos.map((p) => p.data_inicio.getTime());
    expect(new Set(inicios).size).toBe(inicios.length); // sem data_inicio repetida
    // itens não dobram: cada período tem o mesmo conjunto de vendedores uma vez
    for (const p of periodos) {
      const vendedores = p.itens.map((i) => i.vendedor);
      expect(new Set(vendedores).size).toBe(vendedores.length);
    }
  });

  it('o resultado é o mesmo de uma abertura só (nenhum período a mais)', async () => {
    await painel();
    const sozinho = await prisma.comissao_periodo.count();
    await prisma.comissao_periodo_item.deleteMany();
    await prisma.comissao_periodo.deleteMany();

    sincronizarPrimeiraLeitura();
    await Promise.all([painel(), painel()]);

    expect(await prisma.comissao_periodo.count()).toBe(sozinho);
  });

  it('uma abertura depois da outra continua idempotente', async () => {
    await painel();
    const antes = await prisma.comissao_periodo.count();
    await painel();
    expect(await prisma.comissao_periodo.count()).toBe(antes);
  });
});
