import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Estoque from '../../frontend/src/pages/Estoque/Estoque';
import { EstoqueAPI } from '../../frontend/src/services/estoque';

// Mock da API
jest.mock('../../frontend/src/services/estoque', () => ({
  EstoqueAPI: {
    listar: jest.fn().mockResolvedValue([
      { id: 1, nome: 'A', modelo: 'Modelo A', quantidade: 5 },
      { id: 2, nome: 'B', modelo: 'Modelo B', quantidade: 10 },
      { id: 3, nome: 'C', modelo: 'Modelo C', quantidade: 3 }
    ]),
    remover: jest.fn(),
    adicionar: jest.fn(),
    atualizar: jest.fn(),
  }
}));

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

function fakeProduto(overrides = {}) {
  return {
    id: 1,
    produto: 'Mouse Gamer',
    modelo: 'Logitech',
    custo: 100,
    valor_venda: 200,
    qtd_minima: 2,
    garantia: 12,
    qtd_inicial: 10,
    entradas: 0,
    saidas: 0,
    em_estoque: 10,
    ...overrides,
  };
}

describe('<Estoque />', () => {
  test('renderiza mensagem quando não há produtos', async () => {
    EstoqueAPI.listar.mockResolvedValueOnce([]);

    render(<Estoque />);

    await waitFor(() => {
      expect(screen.getByText(/nenhum produto encontrado/i)).toBeInTheDocument();
    });
  });

  test('renderiza produtos da API', async () => {
    EstoqueAPI.listar.mockResolvedValueOnce([fakeProduto()]);

    render(<Estoque />);

    expect(await screen.findByText(/mouse gamer/i)).toBeInTheDocument();
    expect(screen.getByText(/logitech/i)).toBeInTheDocument();
    expect(screen.getByText(/r\$ 100\.00/i)).toBeInTheDocument();
    expect(screen.getByText(/r\$ 200\.00/i)).toBeInTheDocument();
  });

  test('filtra produtos pelo campo de busca', async () => {
    EstoqueAPI.listar.mockResolvedValue([fakeProduto(), fakeProduto({ id: 2, produto: 'Teclado', modelo: 'Corsair' })]);

    render(<Estoque />);

    expect(await screen.findByText(/mouse gamer/i)).toBeInTheDocument();
    expect(screen.getByText(/teclado/i)).toBeInTheDocument();

    const search = screen.getByPlaceholderText(/buscar/i);
    fireEvent.change(search, { target: { value: 'mouse' } });

    await waitFor(() => {
      expect(screen.getByText(/mouse gamer/i)).toBeInTheDocument();
      expect(screen.queryByText(/teclado/i)).not.toBeInTheDocument();
    });
  });

  test('filtro "Só críticos" mostra apenas produtos abaixo do mínimo', async () => {
    EstoqueAPI.listar.mockResolvedValue([
      fakeProduto({ id: 1, produto: 'Monitor', em_estoque: 10, qtd_minima: 2 }),
      fakeProduto({ id: 2, produto: 'Cabo HDMI', em_estoque: 1, qtd_minima: 5 }),
    ]);

    render(<Estoque />);

    expect(await screen.findByText(/monitor/i)).toBeInTheDocument();
    expect(screen.getByText(/cabo hdmi/i)).toBeInTheDocument();

    const check = screen.getByLabelText(/só críticos/i);
    fireEvent.click(check);

    await waitFor(() => {
      expect(screen.queryByText(/monitor/i)).not.toBeInTheDocument();
      expect(screen.getByText(/cabo hdmi/i)).toBeInTheDocument();
    });
  });

  test('ordena produtos ao clicar no cabeçalho', async () => {
    EstoqueAPI.listar.mockResolvedValue([
      fakeProduto({ id: 1, produto: 'Zebra', modelo: 'Modelo Z' }),
      fakeProduto({ id: 2, produto: 'Alpha', modelo: 'Modelo A' }),
    ]);

    render(<Estoque />);

    // Aguarda os produtos carregarem
    await screen.findByText(/zebra/i);
    await screen.findByText(/alpha/i);

    // Verifica ordem inicial (provavelmente alfabética: Alpha depois Zebra)
    const rows = screen.getAllByRole('row');
    
    // A primeira linha de dados deve conter "Alpha" (vem primeiro alfabeticamente)
    expect(rows[1]).toHaveTextContent(/alpha/i);
    expect(rows[2]).toHaveTextContent(/zebra/i);

    // Clica no cabeçalho "Produto" para inverter a ordem
    fireEvent.click(screen.getByText(/produto/i));

    // Aguarda a re-renderização
    await waitFor(() => {
      const updatedRows = screen.getAllByRole('row');
      // Após clicar, a ordem deve inverter: Zebra depois Alpha
      expect(updatedRows[1]).toHaveTextContent(/zebra/i);
      expect(updatedRows[2]).toHaveTextContent(/alpha/i);
    });
  });

  test('abre modal de edição e salva', async () => {
    const produto = fakeProduto();
    EstoqueAPI.listar.mockResolvedValue([produto]);
    EstoqueAPI.atualizar.mockResolvedValue({ ...produto, produto: 'Mouse Atualizado' });

    render(<Estoque />);

    // Aguarda o produto carregar
    await screen.findByText(/mouse gamer/i);

    // Clica para editar
    fireEvent.click(screen.getByText(/editar/i));
    
    // Aguarda o modal abrir
    await screen.findByText(/editar produto/i);

    // Método 1: Buscar pelo valor atual do input
    const inputNome = screen.getByDisplayValue('Mouse Gamer');
    fireEvent.change(inputNome, { target: { value: 'Mouse Atualizado' } });

    // Método 2: Alternativo - buscar por role
    // const inputNome = screen.getByRole('textbox', { name: /nome/i });
    // fireEvent.change(inputNome, { target: { value: 'Mouse Atualizado' } });

    // Clica em salvar
    fireEvent.click(screen.getByText(/salvar/i));

    // Aguarda a atualização
    await waitFor(() => {
      expect(screen.getByText(/mouse atualizado/i)).toBeInTheDocument();
    });
  });

  test('remove produto após confirmar exclusão', async () => {
    const produto = fakeProduto();
    EstoqueAPI.listar.mockResolvedValue([produto]);
    EstoqueAPI.remover.mockResolvedValue({});

    // mock do confirm
    jest.spyOn(window, 'confirm').mockImplementation(() => true);

    render(<Estoque />);

    expect(await screen.findByText(/mouse gamer/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/remover/i));

    await waitFor(() => {
      expect(screen.queryByText(/mouse gamer/i)).not.toBeInTheDocument();
    });
  });
});