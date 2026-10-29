import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import api from '../../src/services/api.js';
import { GarantiasAPI } from '../../src/services/garantias.js';
import { InventarioAPI } from '../../src/services/inventario.js';
import { MarcasAPI } from '../../src/services/marcas.js';
import { PedidoSomAPI } from '../../src/services/pedidoSom.js';
import { MovAPI } from '../../src/services/movimentacoes.js';
import { ComissaoAPI } from '../../src/services/comissao.js';
import { UsuariosAPI } from '../../src/services/usuarios.js';
import { VendasResumoAPI } from '../../src/services/vendasResumo.js';
import { EstoqueResumoAPI } from '../../src/services/estoqueResumo.js';
import { SomRegistroAPI } from '../../src/services/somRegistro.js';
import { TaxasAPI } from '../../src/services/taxas.js';
import { StockMindAPI } from '../../src/services/stockmind.js';
import { EstoqueAPI } from '../../src/services/estoque.js';
import { EstoqueSomAPI } from '../../src/services/estoqueSom.js';
import { MovSomAPI } from '../../src/services/movimentacoesSom.js';
import {
  ESTOQUE_TIPOS, readTipoMap, writeTipoMap, upsertProdutoTipo,
} from '../../src/services/estoqueTipos.js';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GarantiasAPI', () => {
  it('listarTodas pagina com o teto de 200 por página', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 1 }], pages: 1 } });
    expect(await GarantiasAPI.listarTodas({ q: 'silva' })).toEqual([{ id: 1 }]);
    expect(api.get).toHaveBeenCalledWith('/garantias', { params: { q: 'silva', page: 1, pageSize: 200 } });
  });

  it('emprestimosAtivos devolve só a lista de dentro do envelope', async () => {
    api.get.mockResolvedValue({ data: { data: [{ garantia_id: 3, quantidade: 1 }] } });
    expect(await GarantiasAPI.emprestimosAtivos()).toEqual([{ garantia_id: 3, quantidade: 1 }]);
    expect(api.get).toHaveBeenCalledWith('/garantias/emprestimos-ativos');
  });

  it('devolver e finalizar usam PATCH nas sub-rotas da garantia', async () => {
    api.patch.mockResolvedValue({ data: { error: false } });
    await GarantiasAPI.devolver(4);
    expect(api.patch).toHaveBeenLastCalledWith('/garantias/4/devolver');
    await GarantiasAPI.finalizar(4);
    expect(api.patch).toHaveBeenLastCalledWith('/garantias/4/finalizar');
  });

  it('criar, obter, atualizar e deletar batem nas rotas certas', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } });
    api.get.mockResolvedValue({ data: { id: 1 } });
    api.patch.mockResolvedValue({ data: { id: 1 } });
    api.delete.mockResolvedValue({ data: { ok: true } });
    await GarantiasAPI.criar({ a: 1 });
    expect(api.post).toHaveBeenCalledWith('/garantias', { a: 1 });
    await GarantiasAPI.obter(1);
    expect(api.get).toHaveBeenCalledWith('/garantias/1');
    await GarantiasAPI.atualizar(1, { b: 2 });
    expect(api.patch).toHaveBeenCalledWith('/garantias/1', { b: 2 });
    expect(await GarantiasAPI.deletar(1)).toEqual({ ok: true });
    expect(api.delete).toHaveBeenCalledWith('/garantias/1');
  });
});

describe('InventarioAPI', () => {
  beforeEach(() => {
    api.patch.mockResolvedValue({ data: { data: { id: 1 } } });
    api.get.mockResolvedValue({ data: { data: { id: 1 } } });
  });

  it('conferir sem quantidade ("bateu") não manda corpo', async () => {
    await InventarioAPI.conferir(10);
    expect(api.patch).toHaveBeenCalledWith('/inventario/item/10/conferir', undefined);
    await InventarioAPI.conferir(10, '');
    expect(api.patch).toHaveBeenLastCalledWith('/inventario/item/10/conferir', undefined);
  });

  it('conferir com quantidade ("divergiu") manda qtd_contada numérica, inclusive zero', async () => {
    await InventarioAPI.conferir(10, '7');
    expect(api.patch).toHaveBeenLastCalledWith('/inventario/item/10/conferir', { qtd_contada: 7 });
    await InventarioAPI.conferir(10, 0);
    expect(api.patch).toHaveBeenLastCalledWith('/inventario/item/10/conferir', { qtd_contada: 0 });
  });

  it('ativa devolve null quando não há conferência em andamento', async () => {
    api.get.mockResolvedValue({ data: {} });
    expect(await InventarioAPI.ativa('SOM')).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/inventario/SOM/ativa');
  });

  it('detalhe só pede divergentes quando solicitado', async () => {
    await InventarioAPI.detalhe(5);
    expect(api.get).toHaveBeenLastCalledWith('/inventario/5', { params: undefined });
    await InventarioAPI.detalhe(5, { soDivergentes: true });
    expect(api.get).toHaveBeenLastCalledWith('/inventario/5', { params: { so_divergentes: 1 } });
  });

  it('histórico da linha e histórico completo paginam com os padrões de cada um', async () => {
    api.get.mockResolvedValue({ data: { data: [] } });
    await InventarioAPI.historico('BATERIAS');
    expect(api.get).toHaveBeenLastCalledWith('/inventario/BATERIAS/historico', { params: { page: 1, pageSize: 20 } });
    await InventarioAPI.historicoCompleto();
    expect(api.get).toHaveBeenLastCalledWith('/inventario/historico', { params: { page: 1, pageSize: 50 } });
  });

  it('iniciar, finalizar, desconferir e cancelar usam o verbo certo', async () => {
    api.post.mockResolvedValue({ data: { data: { id: 2 } } });
    api.delete.mockResolvedValue({});
    expect(await InventarioAPI.iniciar('SOM')).toEqual({ id: 2 });
    expect(api.post).toHaveBeenLastCalledWith('/inventario/SOM/iniciar');
    await InventarioAPI.finalizar(2);
    expect(api.post).toHaveBeenLastCalledWith('/inventario/2/finalizar');
    await InventarioAPI.desconferir(11);
    expect(api.patch).toHaveBeenLastCalledWith('/inventario/item/11/desconferir');
    expect(await InventarioAPI.cancelar(2)).toBeUndefined();
    expect(api.delete).toHaveBeenCalledWith('/inventario/2/cancelar');
  });
});

describe('MarcasAPI', () => {
  it('listar pede só as ativas por padrão e todas quando solicitado', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 1, nome: 'Moura' }] } });
    expect(await MarcasAPI.listar()).toEqual([{ id: 1, nome: 'Moura' }]);
    expect(api.get).toHaveBeenLastCalledWith('/marcas', { params: {} });
    await MarcasAPI.listar({ todas: true });
    expect(api.get).toHaveBeenLastCalledWith('/marcas', { params: { todas: 1 } });
  });

  it('criar manda { nome } e atualizar faz PATCH no id', async () => {
    api.post.mockResolvedValue({ data: { id: 3 } });
    api.patch.mockResolvedValue({ data: { id: 3, ativo: false } });
    await MarcasAPI.criar('Acdelco');
    expect(api.post).toHaveBeenCalledWith('/marcas', { nome: 'Acdelco' });
    expect(await MarcasAPI.atualizar(3, { ativo: false })).toEqual({ id: 3, ativo: false });
    expect(api.patch).toHaveBeenCalledWith('/marcas/3', { ativo: false });
  });
});

describe('PedidoSomAPI e MovAPI', () => {
  it('criar, obter e atualizar desembrulham { data } quando existe', async () => {
    api.post.mockResolvedValue({ data: { data: { id: 1 } } });
    api.get.mockResolvedValue({ data: { id: 2 } });
    api.put.mockResolvedValue({ data: { data: { id: 3 } } });
    expect(await PedidoSomAPI.criar({})).toEqual({ id: 1 });
    expect(await PedidoSomAPI.obter(2)).toEqual({ id: 2 });
    expect(await PedidoSomAPI.atualizar(3, { forma: 'pix' })).toEqual({ id: 3 });
    expect(api.put).toHaveBeenCalledWith('/pedido-som/3', { forma: 'pix' });
  });

  it('listarTodos busca todas as páginas de pedidos', async () => {
    api.get
      .mockResolvedValueOnce({ data: { data: [{ id: 1 }], pages: 2 } })
      .mockResolvedValueOnce({ data: { data: [{ id: 2 }], pages: 2 } });
    expect(await PedidoSomAPI.listarTodos()).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('fila de conferência de pedidos e de vendas usa rotas separadas', async () => {
    api.get.mockResolvedValue({ data: { data: [] } });
    api.patch.mockResolvedValue({ data: { data: { id: 9, status_verificacao: 'conferido' } } });
    await PedidoSomAPI.listarPendencias({ page: 2 });
    expect(api.get).toHaveBeenLastCalledWith('/pedido-som/pendencias-verificacao', { params: { page: 2, pageSize: 20 } });
    await MovAPI.listarPendencias();
    expect(api.get).toHaveBeenLastCalledWith('/movimentacoes/pendencias-verificacao', { params: { page: 1, pageSize: 20 } });
    expect(await MovAPI.conferir(9)).toEqual({ id: 9, status_verificacao: 'conferido' });
    expect(api.patch).toHaveBeenLastCalledWith('/movimentacoes/9/conferir');
    await PedidoSomAPI.conferir(5);
    expect(api.patch).toHaveBeenLastCalledWith('/pedido-som/5/conferir');
  });

  it('remover pedido chama DELETE', async () => {
    api.delete.mockResolvedValue({});
    await PedidoSomAPI.remover(4);
    expect(api.delete).toHaveBeenCalledWith('/pedido-som/4');
  });
});

describe('ComissaoAPI, TaxasAPI e UsuariosAPI', () => {
  it('comissão devolve sempre o conteúdo de "data"', async () => {
    api.get.mockResolvedValue({ data: { data: { total: 10 } } });
    api.put.mockResolvedValue({ data: { data: { valor_bateria: 20 } } });
    expect(await ComissaoAPI.painel()).toEqual({ total: 10 });
    expect(await ComissaoAPI.getConfig()).toEqual({ total: 10 });
    expect(await ComissaoAPI.periodos()).toEqual({ total: 10 });
    expect(await ComissaoAPI.periodo(7)).toEqual({ total: 10 });
    expect(api.get).toHaveBeenLastCalledWith('/comissao/periodos/7');
    expect(await ComissaoAPI.salvarConfig({ valor_bateria: 20 })).toEqual({ valor_bateria: 20 });
    expect(api.put).toHaveBeenCalledWith('/comissao/config', { valor_bateria: 20 });
  });

  it('taxas lê e grava a config singleton', async () => {
    api.get.mockResolvedValue({ data: { data: { debito: 1.36 } } });
    api.put.mockResolvedValue({ data: { data: { debito: 2 } } });
    expect(await TaxasAPI.getConfig()).toEqual({ debito: 1.36 });
    expect(await TaxasAPI.salvarConfig({ debito: 2 })).toEqual({ debito: 2 });
    expect(api.put).toHaveBeenCalledWith('/taxas/config', { debito: 2 });
  });

  it('listar usuários devolve lista vazia quando a resposta vem sem dados', async () => {
    api.get.mockResolvedValue({ data: {} });
    expect(await UsuariosAPI.listar()).toEqual([]);
  });

  it('criar usuário manda só nome, email, senha e permissões', async () => {
    api.post.mockResolvedValue({ data: { data: { id: 1 } } });
    await UsuariosAPI.criar({ name: 'Ana', email: 'a@b.com', password: 'x', permissoes: { home: true }, extra: 'ignorado' });
    expect(api.post).toHaveBeenCalledWith('/usuarios', {
      name: 'Ana', email: 'a@b.com', password: 'x', permissoes: { home: true },
    });
  });

  it('atualizar usuário manda só nome e permissões; excluir chama DELETE', async () => {
    api.patch.mockResolvedValue({ data: { data: { id: 2 } } });
    api.delete.mockResolvedValue({});
    await UsuariosAPI.atualizar(2, { name: 'Bia', permissoes: {}, email: 'nao@vai.com' });
    expect(api.patch).toHaveBeenCalledWith('/usuarios/2', { name: 'Bia', permissoes: {} });
    await UsuariosAPI.excluir(2);
    expect(api.delete).toHaveBeenCalledWith('/usuarios/2');
  });
});

describe('VendasResumoAPI, EstoqueResumoAPI, SomRegistroAPI e StockMindAPI', () => {
  it('resumo sem período não manda parâmetros', async () => {
    api.get.mockResolvedValue({ data: { data: { total: {} } } });
    await VendasResumoAPI.resumo();
    expect(api.get).toHaveBeenCalledWith('/vendas-resumo', { params: {} });
  });

  it('resumo converte Date para ISO e mantém strings como vieram', async () => {
    api.get.mockResolvedValue({ data: { data: null } });
    await VendasResumoAPI.resumo({ from: new Date('2026-10-01T00:00:00Z'), to: '2026-10-15' });
    expect(api.get).toHaveBeenCalledWith('/vendas-resumo', {
      params: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-15' },
    });
  });

  it('resumo sem dados devolve null, não undefined', async () => {
    api.get.mockResolvedValue({ data: {} });
    expect(await VendasResumoAPI.resumo()).toBeNull();
  });

  it('resumos de estoque (custo, venda, críticos) devolvem null sem dados', async () => {
    api.get.mockResolvedValue({ data: {} });
    expect(await EstoqueResumoAPI.custo()).toBeNull();
    expect(await EstoqueResumoAPI.venda()).toBeNull();
    expect(await EstoqueResumoAPI.criticos()).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/estoque-resumo/criticos');
  });

  it('registro do Som omite filtro "tudo" e busca vazia', async () => {
    api.get.mockResolvedValue({ data: { dias: [] } });
    await SomRegistroAPI.buscar({ de: '2026-10-01', ate: '2026-10-31', filtro: 'tudo', q: '' });
    expect(api.get).toHaveBeenLastCalledWith('/som/registro', { params: { de: '2026-10-01', ate: '2026-10-31' } });
    await SomRegistroAPI.buscar({ de: 'a', ate: 'b', filtro: 'fiado', q: 'civic' });
    expect(api.get).toHaveBeenLastCalledWith('/som/registro', { params: { de: 'a', ate: 'b', filtro: 'fiado', q: 'civic' } });
  });

  it('StockMind devolve o corpo da previsão inteiro', async () => {
    api.get.mockResolvedValue({ data: { gerado_em: 'hoje', itens: [] } });
    expect(await StockMindAPI.getPrevisao()).toEqual({ gerado_em: 'hoje', itens: [] });
  });
});

describe('clientes montados pela fábrica', () => {
  it('estoque, estoque-som e movimentações-som apontam para o caminho da própria linha', async () => {
    api.get.mockResolvedValue({ data: { id: 1 } });
    api.post.mockResolvedValue({ data: {} });
    await EstoqueAPI.obter(1);
    expect(api.get).toHaveBeenLastCalledWith('/estoque/1');
    await EstoqueSomAPI.obter(1);
    expect(api.get).toHaveBeenLastCalledWith('/estoque-som/1');
    await MovSomAPI.criar({ produto_id: 1, tipo: 'entrada', quantidade: 2 });
    expect(api.post).toHaveBeenLastCalledWith('/movimentacoes-som', { produto_id: 1, tipo: 'entrada', quantidade: 2 });
  });
});

describe('estoqueTipos (mapa produto → linha no localStorage)', () => {
  it('expõe as duas linhas', () => {
    expect(ESTOQUE_TIPOS).toEqual({ BATERIAS: 'baterias', SOM: 'som' });
  });

  it('readTipoMap devolve {} quando nada foi salvo', () => {
    expect(readTipoMap()).toEqual({});
  });

  it('writeTipoMap e readTipoMap fazem o ciclo completo', () => {
    writeTipoMap({ 1: 'som' });
    expect(readTipoMap()).toEqual({ 1: 'som' });
  });

  it('upsertProdutoTipo acrescenta sem apagar os outros produtos', () => {
    upsertProdutoTipo(1, 'som');
    const mapa = upsertProdutoTipo(2, 'baterias');
    expect(mapa).toEqual({ 1: 'som', 2: 'baterias' });
    expect(readTipoMap()).toEqual({ 1: 'som', 2: 'baterias' });
  });

  it('upsertProdutoTipo ignora id ou tipo ausentes', () => {
    expect(upsertProdutoTipo(null, 'som')).toBeUndefined();
    expect(upsertProdutoTipo(3, '')).toBeUndefined();
    expect(readTipoMap()).toEqual({});
  });

  it('conteúdo corrompido no localStorage não quebra: volta {} e registra o erro', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('estoqueTipos', '{quebrado');
    expect(readTipoMap()).toEqual({});
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
