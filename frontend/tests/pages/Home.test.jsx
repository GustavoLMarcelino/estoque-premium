// Home: os quadros do painel inicial e o que cada usuário enxerga conforme a
// linha (Baterias/Som) e a permissão de ver custo. Os números vêm prontos do
// servidor — a tela não soma nada, só mostra.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/services/api.js', () => ({ default: { get: vi.fn() } }));
vi.mock('../../src/services/estoqueResumo.js', () => ({
  EstoqueResumoAPI: { custo: vi.fn(), venda: vi.fn(), criticos: vi.fn() },
}));
vi.mock('../../src/services/vendasResumo.js', () => ({ VendasResumoAPI: { resumo: vi.fn() } }));

import api from '../../src/services/api.js';
import { EstoqueResumoAPI } from '../../src/services/estoqueResumo.js';
import { VendasResumoAPI } from '../../src/services/vendasResumo.js';
import Home from '../../src/pages/Home/home.jsx';

function logar(...chaves) {
  localStorage.setItem('token', 'tk');
  localStorage.setItem('role', 'user');
  localStorage.setItem('permissoes', JSON.stringify(Object.fromEntries(['home', ...chaves].map((c) => [c, true]))));
}

// Meio-dia UTC: a data mostrada não muda de dia em nenhum fuso do Brasil.
const mov = (dia, produto, extra = {}) => ({
  tipo: 'SAIDA', quantidade: 1, data_movimentacao: `2026-11-${String(dia).padStart(2, '0')}T12:00:00.000Z`,
  estoque: { produto, modelo: 'X' }, ...extra,
});
const resposta = (...linhas) => ({ data: { data: linhas } });

/** Responde às duas rotas de movimentação que a Home chama direto no axios. */
function movimentacoes({ baterias = [], som = [] } = {}) {
  api.get.mockImplementation((rota) => {
    if (rota === '/movimentacoes') return Promise.resolve(resposta(...baterias));
    if (rota === '/movimentacoes-som') return Promise.resolve(resposta(...som));
    return Promise.reject(new Error(`rota inesperada: ${rota}`));
  });
}

const rotasChamadas = () => api.get.mock.calls.map(([rota]) => rota);
const carregou = () => waitFor(() => expect(screen.queryByText('Carregando...')).not.toBeInTheDocument());
const linhasDaTabela = () => screen.getAllByRole('row').slice(1); // sem o cabeçalho

beforeEach(() => {
  vi.resetAllMocks();
  logar('linha_baterias');
  movimentacoes({ baterias: [mov(10, 'Bateria 60Ah')] });
  EstoqueResumoAPI.venda.mockResolvedValue({
    total: { valor: 5000, itens: 20, produtos: 4 },
    baterias: { valor: 5000, itens: 20, produtos: 4 },
    som: null,
  });
  EstoqueResumoAPI.criticos.mockResolvedValue({ total: { quantidade: 0, itens: [] }, baterias: { quantidade: 0, itens: [] }, som: null });
  EstoqueResumoAPI.custo.mockResolvedValue({
    total: { valor: 3000, itens: 20, produtos: 4 },
    baterias: { valor: 3000, itens: 20, produtos: 4 },
    som: null,
  });
  VendasResumoAPI.resumo.mockResolvedValue({ total: { vendasBrutas: 1234.5, qtdVendas: 7, aReceber: { qtd: 0, valor: 0 } } });
});

describe('Home — quadros do painel', () => {
  it('mostra a contagem de produtos, os críticos e as vendas da semana que o servidor devolveu', async () => {
    render(<Home />);
    expect(await screen.findByText('4 produtos')).toBeInTheDocument();
    expect(screen.getByText('0 itens')).toBeInTheDocument();
    expect(screen.getByText(/1\.234,50/)).toBeInTheDocument();
    // Valor Total: com uma linha só, mostra o valor dela (sem carrossel).
    expect(screen.getByText(/5\.000,00/)).toBeInTheDocument();
    expect(screen.getByText('20 unidades · 4 produtos')).toBeInTheDocument();
  });

  it('as vendas da semana são pedidas ao servidor com um período de exatamente 7 dias', async () => {
    render(<Home />);
    await carregou();
    const { from, to } = VendasResumoAPI.resumo.mock.calls[0][0];
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('havendo venda fiado na semana, o card de vendas ganha a face "A receber"', async () => {
    VendasResumoAPI.resumo.mockResolvedValue({
      total: { vendasBrutas: 1000, qtdVendas: 3, aReceber: { qtd: 2, valor: 400 } },
    });
    const user = userEvent.setup();
    render(<Home />);
    await user.click(await screen.findByRole('button', { name: 'Ver A receber' }));
    expect(screen.getByText(/400,00/)).toBeInTheDocument();
    expect(screen.getByText('2 vendas fiado · já no faturado')).toBeInTheDocument();
  });

  it('sem venda fiado na semana, o card de vendas não oferece a face "A receber"', async () => {
    render(<Home />);
    await carregou();
    expect(screen.queryByRole('button', { name: 'Ver A receber' })).not.toBeInTheDocument();
  });

  it('clicar em Produtos Críticos abre a lista separada por linha, com saldo e mínimo', async () => {
    logar('linha_baterias', 'linha_som');
    const itens = [
      { id: 1, linha: 'baterias', produto: 'Bateria 60Ah', modelo: 'M60', em_estoque: 1, qtd_minima: 3 },
      { id: 9, linha: 'som', produto: 'Autofalante', modelo: 'A6', em_estoque: 0, qtd_minima: 2 },
    ];
    EstoqueResumoAPI.criticos.mockResolvedValue({ total: { quantidade: 2, itens }, baterias: {}, som: {} });
    const user = userEvent.setup();
    render(<Home />);
    await user.click(await screen.findByText('2 itens'));

    const modal = screen.getByRole('dialog');
    expect(within(modal).getByText('Baterias')).toBeInTheDocument();
    expect(within(modal).getByText('Som')).toBeInTheDocument();
    expect(within(modal).getByText('Bateria 60Ah')).toBeInTheDocument();
    expect(within(modal).getByText('Autofalante')).toBeInTheDocument();
  });
});

describe('Home — o que cada linha enxerga', () => {
  it('usuário só de Baterias busca só as movimentações de Baterias', async () => {
    render(<Home />);
    await carregou();
    expect(rotasChamadas()).toEqual(['/movimentacoes']);
  });

  it('usuário só de Som busca só as movimentações de Som', async () => {
    logar('linha_som');
    movimentacoes({ som: [mov(9, 'Autofalante')] });
    render(<Home />);
    expect(await screen.findByText('Autofalante - X')).toBeInTheDocument();
    expect(rotasChamadas()).toEqual(['/movimentacoes-som']);
  });

  it('com as duas linhas, o Valor Total alterna entre Total geral, Baterias e Som', async () => {
    logar('linha_baterias', 'linha_som');
    movimentacoes();
    EstoqueResumoAPI.venda.mockResolvedValue({
      total: { valor: 7000, itens: 30, produtos: 6 },
      baterias: { valor: 5000, itens: 20, produtos: 4 },
      som: { valor: 2000, itens: 10, produtos: 2 },
    });
    const user = userEvent.setup();
    render(<Home />);
    expect(await screen.findByText(/7\.000,00/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver Som' }));
    expect(screen.getByText(/2\.000,00/)).toBeInTheDocument();
    expect(screen.getByText('10 unidades · 2 produtos')).toBeInTheDocument();
  });
});

describe('Home — custo só para quem pode ver', () => {
  it('sem a permissão de ver custo, o card de custo não aparece e o servidor nem é consultado', async () => {
    render(<Home />);
    await carregou();
    expect(EstoqueResumoAPI.custo).not.toHaveBeenCalled();
    expect(screen.queryByText('Custo imobilizado no estoque')).not.toBeInTheDocument();
  });

  it('com a permissão de ver custo, mostra o custo imobilizado no estoque', async () => {
    logar('linha_baterias', 'ver_custo');
    render(<Home />);
    expect(await screen.findByText('Custo imobilizado no estoque')).toBeInTheDocument();
    expect(screen.getByText(/3\.000,00/)).toBeInTheDocument();
  });
});

describe('Home — últimas movimentações', () => {
  it('junta as duas linhas e mostra só as 8 mais recentes, da mais nova para a mais antiga', async () => {
    logar('linha_baterias', 'linha_som');
    movimentacoes({
      baterias: [1, 3, 5, 7, 9].map((d) => mov(d, `Bateria dia ${d}`)),
      som: [2, 4, 6, 8, 10].map((d) => mov(d, `Som dia ${d}`, { tipo: 'ENTRADA' })),
    });
    render(<Home />);
    expect(await screen.findByText('Som dia 10 - X')).toBeInTheDocument();

    const linhas = linhasDaTabela();
    expect(linhas).toHaveLength(8);
    expect(within(linhas[0]).getByText('Som dia 10 - X')).toBeInTheDocument();
    expect(within(linhas[0]).getByText('Entrada')).toBeInTheDocument();
    expect(within(linhas[1]).getByText('Bateria dia 9 - X')).toBeInTheDocument();
    expect(within(linhas[1]).getByText('Saida')).toBeInTheDocument();
    // As duas mais antigas (dias 1 e 2) ficam de fora.
    expect(screen.queryByText('Bateria dia 1 - X')).not.toBeInTheDocument();
    expect(screen.queryByText('Som dia 2 - X')).not.toBeInTheDocument();
  });

  it('sem nenhuma movimentação, avisa "Sem movimentações recentes"', async () => {
    movimentacoes();
    render(<Home />);
    expect(await screen.findByText('Sem movimentações recentes')).toBeInTheDocument();
  });

  it('se o servidor recusar as movimentações, a Home mostra o motivo e os outros quadros continuam', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.get.mockRejectedValue({ response: { data: { message: 'Você não tem permissão para esta ação.' } } });
    render(<Home />);
    expect(await screen.findByText('Você não tem permissão para esta ação.')).toBeInTheDocument();
    expect(screen.getByText('4 produtos')).toBeInTheDocument();
    expect(screen.getByText(/1\.234,50/)).toBeInTheDocument();
    erro.mockRestore();
  });
});
