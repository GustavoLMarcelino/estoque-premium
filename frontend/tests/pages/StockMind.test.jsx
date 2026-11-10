import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
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

const ESTOQUE_PARADO = {
  hoje: '2026-11-10',
  parametros: { limitePromocaoDias: 90, limiteRecargaDias: 120 },
  resumo: {
    skusComEstoque: 7, skusComData: 6, tempoMedioDias: 122, tempoMedianoDias: 62,
    skusParados: 30, valorParado: 20652.98, valorMedioParado: 688.43, skusPromocao: 30, skusRecarga: 18, valorRecarga: 14249.16,
  },
  top: [
    {
      id: 110, produto: 'Heliar HAGM80HD AGM 80AH', marca: 'Heliar', estoque: 1, custo: 1682.79, valorParado: 1682.79, dias: 574,
      dataReferencia: '2025-04-15', origem: 'venda_historico', estimada: true, nivelHistorico: 'subgrupo', promocao: true, recarga: true,
    },
    {
      id: 58, produto: 'DF3000 150AH', marca: 'Freedom', estoque: 1, custo: 842, valorParado: 842, dias: 100,
      dataReferencia: '2026-08-02', origem: 'venda_producao', estimada: false, nivelHistorico: null, promocao: true, recarga: false,
    },
    {
      id: 4, produto: 'Eletran 60APD Advanced 60AH', marca: 'Eletran', estoque: 37, custo: 165.99, valorParado: 6141.63, dias: 11,
      dataReferencia: '2026-10-30', origem: 'entrada', estimada: false, nivelHistorico: null, promocao: false, recarga: false,
    },
  ],
  parados: [
    {
      id: 110, produto: 'Heliar HAGM80HD AGM 80AH', marca: 'Heliar', estoque: 1, custo: 1682.79, valorParado: 1682.79, dias: 574,
      dataReferencia: '2025-04-15', origem: 'venda_historico', estimada: true, nivelHistorico: 'subgrupo', promocao: true, recarga: true,
    },
    {
      id: 58, produto: 'DF3000 150AH', marca: 'Freedom', estoque: 1, custo: 842, valorParado: 842, dias: 100,
      dataReferencia: '2026-08-02', origem: 'venda_producao', estimada: false, nivelHistorico: null, promocao: true, recarga: false,
    },
    {
      id: 77, produto: 'Moura 60AH Teste', marca: 'Moura', estoque: 6, custo: 400, valorParado: 2400, dias: 95,
      dataReferencia: '2026-08-07', origem: 'venda_producao', estimada: false, nivelHistorico: null, promocao: true, recarga: false,
    },
  ],
  semVendaRegistrada: {
    skus: 2, unidades: 3, valor: 1500.5,
    itens: [
      { id: 57, produto: 'DF2000 100AH', marca: 'Freedom', estoque: 2, valor: 1054 },
      { id: 106, produto: 'Moura 1.3 Estacionaria 1.3AH', marca: 'Moura', estoque: 1, valor: 446.5 },
    ],
  },
  previsaoGeradaEm: '2026-11-10T01:25:00+00:00',
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/stockmind/estoque-parado' ? ESTOQUE_PARADO : PREVISAO }));
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

describe('Estoque parado (Dashboard Inteligente)', () => {
  const renderizar = () => render(<MemoryRouter><DashboardInteligente /></MemoryRouter>);

  it('mostra tempo médio com a mediana, valor parado, produtos para promoção e verificação de carga', async () => {
    renderizar();
    const tempo = (await screen.findByText('Tempo médio sem venda')).closest('div').parentElement;
    expect(within(tempo).getByText('122 dias')).toBeInTheDocument();
    expect(within(tempo).getByText(/mediana 62 dias/)).toBeInTheDocument();

    const valor = screen.getByText('Valor parado (> 90 dias)').closest('div').parentElement;
    expect(within(valor).getByText(/20\.652,98/)).toBeInTheDocument();
    expect(within(valor).getByText(/30 produtos · média de .*688,43 por produto/)).toBeInTheDocument();

    const promo = screen.getByText('Produtos para promoção').closest('div').parentElement;
    expect(within(promo).getByText('30')).toBeInTheDocument();
    const carga = screen.getByText('Verificação de carga').closest('div').parentElement;
    expect(within(carga).getByText('18')).toBeInTheDocument();
    expect(within(carga).getByText('produtos parados há mais de 120 dias')).toBeInTheDocument();
  });

  it('clicar nos cards abre a lista de produtos; clicar de novo fecha', async () => {
    renderizar();
    const promo = (await screen.findByText('Produtos para promoção')).closest('button');
    expect(screen.queryByText(/^Produtos para promoção \(/)).not.toBeInTheDocument();
    fireEvent.click(promo);
    expect(screen.getByText('Produtos para promoção (3)')).toBeInTheDocument();
    expect(screen.getAllByText('Moura 60AH Teste').length).toBeGreaterThan(0);
    fireEvent.click(promo);
    expect(screen.queryByText('Produtos para promoção (3)')).not.toBeInTheDocument();
  });

  it('verificação de carga lista só os > 120 dias; valor parado ordena por valor', async () => {
    renderizar();
    fireEvent.click((await screen.findByText('Verificação de carga')).closest('button'));
    expect(screen.getByText('Produtos para verificação de carga (1)')).toBeInTheDocument();
    expect(screen.queryByText('Moura 60AH Teste')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/^Valor parado \(> 90 dias\)/).closest('button'));
    const titulo = screen.getByText('Valor parado por produto (maior primeiro) (3)');
    const nomes = within(titulo.closest('div')).getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(nomes[0]).toMatch(/Moura 60AH Teste/);
    expect(nomes[2]).toMatch(/DF3000/);
  });

  it('top 5 mostra dias, valor, origem da data e os badges certos', async () => {
    renderizar();
    await screen.findByText('Baterias paradas há mais tempo (top 5)');
    expect(screen.getAllByText('Heliar HAGM80HD AGM 80AH').length).toBeGreaterThan(0);
    // data estimada pelo histórico: piso "≥" e origem do grupo
    expect(screen.getAllByText('≥ 574 dias').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/venda \(histórico do grupo\) · 15\/04\/2025/).length).toBeGreaterThan(0);
    // data exata de produção e entrada/compra
    expect(screen.getAllByText('100 dias').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/venda \(produção\) · 02\/08\/2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/entrada\/compra · 30\/10\/2026/).length).toBeGreaterThan(0);
    // badges: o de 574 dias tem os dois; o de 100 só promoção; o de 11 dias nenhum
    expect(screen.getAllByText('Colocar em promoção')).toHaveLength(4); // 2 SKUs × (tabela + lista mobile)
    expect(screen.getAllByText('Verificar carga / recarregar')).toHaveLength(2);
  });

  it('"sem venda registrada" fica separado, com o texto combinado', async () => {
    renderizar();
    const card = (await screen.findByText('Sem venda registrada')).closest('div');
    expect(within(card).getByText('Sem venda desde mar/2022 ou produto novo.')).toBeInTheDocument();
    expect(within(card).getByText(/fora das contagens acima/)).toBeInTheDocument();
    expect(within(card).getByText('DF2000 100AH')).toBeInTheDocument();
    expect(screen.queryByText(/null|undefined/)).not.toBeInTheDocument();
  });

  it('se o estoque parado falhar, o resto do dashboard continua', async () => {
    api.get.mockImplementation((url) =>
      url === '/stockmind/estoque-parado' ? Promise.reject(new Error('500')) : Promise.resolve({ data: PREVISAO }));
    renderizar();
    expect(await screen.findByText('Não foi possível carregar o estoque parado agora.')).toBeInTheDocument();
    expect(screen.getByText('Grupos com maior risco')).toBeInTheDocument();
  });

  it('resposta fora do formato não quebra a tela', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url === '/stockmind/estoque-parado' ? { foo: 1 } : PREVISAO }));
    renderizar();
    expect(await screen.findByText('Não foi possível carregar o estoque parado agora.')).toBeInTheDocument();
  });
});
