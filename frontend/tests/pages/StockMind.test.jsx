import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/services/api.js', () => ({
  default: { get: vi.fn() },
}));

import api from '../../src/services/api.js';
import RecomendacoesReposicao from '../../src/pages/stockmind/RecomendacoesReposicao.jsx';
import DashboardInteligente from '../../src/pages/stockmind/DashboardInteligente.jsx';

function sku(id, produto, marca, estoque, minimo, vendas, participacao, sugestao = 0) {
  return {
    id, produto, marca, estoqueAtual: estoque, estoqueMinimo: minimo, vendas6m: vendas,
    participacao, ultimaVenda: null, distribuicaoSugerida: sugestao,
  };
}

const PREVISAO = {
  schema: 2,
  gerado_em: '2026-11-03T12:00:00+00:00',
  mes_previsto: '2026-11',
  parametros: { coberturaAltaDias: 10, coberturaMediaDias: 20, horizonteDias: 30, janelaParticipacaoMeses: 6 },
  demandaPorCategoria: [{ categoria: 'Carro', demanda: 40.5 }],
  grupos: [
    {
      id: 'carro-70-convencional-normal-normal', grupo: '70AH Convencional Carro', categoria: 'Carro',
      estoqueAtual: 4, estoqueSeguranca: 4, demandaPrevista30d: 6.5, coberturaDias: 18.5,
      quantidadeSugerida: 7, acao: 'Comprar 7 un', prioridade: 'media', giro: 'medio', confianca: 'alta',
      justificativa: 'Grupo 70AH Convencional Carro: necessidade de 10 un.',
      skus: [sku(1, 'Júpiter JJF70D 70AH', 'Júpiter', 4, 4, 9, 0.75, 5), sku(2, 'Acdelco ADR70ND 70AH', 'Acdelco', 0, 0, 3, 0.25, 2)],
    },
    {
      id: 'carro-60-convencional-normal-normal', grupo: '60AH Convencional Carro', categoria: 'Carro',
      estoqueAtual: 222, estoqueSeguranca: 60, demandaPrevista30d: 34, coberturaDias: 196,
      quantidadeSugerida: 0, acao: 'Estoque suficiente', prioridade: 'baixa', giro: 'alto', confianca: 'alta',
      justificativa: 'Grupo 60AH Convencional Carro: o estoque do grupo é suficiente.',
      skus: [sku(3, 'ONBAT F60DN 60AH', 'ONBAT', 52, 10, 30, 0.6), sku(4, 'Varta 60DD 60AH', 'Varta', 44, 5, 20, 0.4)],
    },
    {
      id: 'carro-60-agm-normal-normal', grupo: '60AH AGM Carro', categoria: 'Carro',
      estoqueAtual: 0, estoqueSeguranca: 1, demandaPrevista30d: 0, coberturaDias: null,
      quantidadeSugerida: 1, acao: 'Repor mínimo (1 un)', prioridade: 'media', giro: 'sem_giro', confianca: 'alta',
      justificativa: 'Grupo 60AH AGM Carro: sem giro previsto.',
      skus: [sku(5, 'Acdelco ADG60HD AGM 60AH', 'Acdelco', 0, 1, 0, null)],
    },
    {
      id: 'carro-95-agm-normal-normal', grupo: '95AH AGM Carro', categoria: 'Carro',
      estoqueAtual: 1, estoqueSeguranca: 1, demandaPrevista30d: 30, coberturaDias: 1,
      quantidadeSugerida: 30, acao: 'Comprar 30 un', prioridade: 'alta', giro: 'alto', confianca: 'alta',
      justificativa: 'Grupo 95AH AGM Carro: cobertura de 1 dia.',
      skus: [sku(6, 'Acdelco ADG95MD AGM 95AH', 'Acdelco', 1, 1, 12, 1, 30)],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: PREVISAO });
});

describe('Recomendações de Reposição (por grupo)', () => {
  it('mostra uma linha por grupo, não por produto', async () => {
    render(<RecomendacoesReposicao />);
    expect(await screen.findByText('Sugestões de compra por grupo (4)')).toBeInTheDocument();
    expect(screen.getAllByText('60AH Convencional Carro').length).toBeGreaterThan(0);
    // os SKUs só aparecem depois de expandir
    expect(screen.queryByText('ONBAT F60DN 60AH')).not.toBeInTheDocument();
  });

  it('mostra a ação do grupo e nunca "Comprar null"', async () => {
    render(<RecomendacoesReposicao />);
    await screen.findByText('Sugestões de compra por grupo (4)');
    expect(screen.getAllByText('Comprar 30 un').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Estoque suficiente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Repor mínimo (1 un)').length).toBeGreaterThan(0);
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
  });

  it('expande o grupo com os SKUs, estoque, participação e sugestão por marca', async () => {
    const user = userEvent.setup();
    render(<RecomendacoesReposicao />);
    await screen.findByText('Sugestões de compra por grupo (4)');

    // primeiro botão "Ver produtos" do desktop = primeiro grupo (70AH, ordem do backend)
    await user.click(screen.getAllByRole('button', { name: /Ver produtos/ })[0]);
    expect(screen.getAllByText('Júpiter JJF70D 70AH').length).toBeGreaterThan(0);
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sugestão').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/A decisão final de marca é sua/).length).toBeGreaterThan(0);
  });

  it('filtra por criticidade', async () => {
    const user = userEvent.setup();
    render(<RecomendacoesReposicao />);
    await screen.findByText('Sugestões de compra por grupo (4)');
    await user.selectOptions(screen.getByLabelText('Criticidade'), 'alta');
    expect(screen.getByText('Sugestões de compra por grupo (1)')).toBeInTheDocument();
  });

  it('pede para regerar a previsão quando o JSON está em formato antigo', async () => {
    api.get.mockResolvedValue({ data: { produtos: [], gerado_em: '2026-09-18T00:00:00+00:00' } });
    render(<RecomendacoesReposicao />);
    expect(await screen.findByText(/formato antigo/)).toBeInTheDocument();
  });
});

describe('Dashboard Inteligente (por grupo)', () => {
  function renderizar() {
    return render(
      <MemoryRouter>
        <DashboardInteligente />
      </MemoryRouter>,
    );
  }

  it('conta grupos, não produtos, em Risco de Ruptura e Alto Giro', async () => {
    renderizar();
    const monitorados = (await screen.findByText('Grupos Monitorados')).closest('div').parentElement;
    expect(within(monitorados).getByText('4')).toBeInTheDocument();
    expect(within(monitorados).getByText('6 produtos em 4 grupos')).toBeInTheDocument();

    const risco = screen.getByText('Risco de Ruptura').closest('div').parentElement;
    expect(within(risco).getByText('1')).toBeInTheDocument();
    expect(within(risco).getByText('grupos com cobertura < 10 dias')).toBeInTheDocument();

    const giro = screen.getByText('Alto Giro').closest('div').parentElement;
    expect(within(giro).getByText('2')).toBeInTheDocument();
    expect(within(giro).getByText(/grupos no terço de maior demanda/)).toBeInTheDocument();
  });

  it('lista só grupos de risco (alta/média) com a ação do grupo', async () => {
    renderizar();
    await screen.findByText('Grupos com maior risco');
    expect(screen.getAllByText('95AH AGM Carro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Repor mínimo (1 un)').length).toBeGreaterThan(0);
    expect(screen.queryByText('60AH Convencional Carro')).not.toBeInTheDocument(); // baixa: fora da lista
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
  });

  it('mostra erro claro quando a previsão ainda não foi gerada', async () => {
    api.get.mockRejectedValue({ response: { data: { message: 'Previsão ainda não foi gerada.' } } });
    renderizar();
    await waitFor(() => expect(screen.getByText('Previsão ainda não foi gerada.')).toBeInTheDocument());
  });
});
