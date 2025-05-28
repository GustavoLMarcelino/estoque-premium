
// Ta funcionando o TESTE!!

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LancamentoEntradaSaida from './LancamentoEntradaSaida';

// Mocks
jest.mock('../../firebase', () => ({
  db: {}
}));

const mockAddDoc = jest.fn(() => Promise.resolve());
const mockGetDocs = jest.fn((coll) => {
  // Simula docs de produtos e movimentações
  if (coll._key?.path?.segments?.includes("produtos")) {
    return Promise.resolve({
      docs: [
        { id: '1', data: () => ({ nome: 'Bateria X', quantidadeInicial: 10 }) }
      ]
    });
  }
  if (coll._key?.path?.segments?.includes("movimentacoes")) {
    return Promise.resolve({
      docs: []
    });
  }
  return Promise.resolve({ docs: [] });
});

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((db, name) => ({ _key: { path: { segments: [name] } } })),
  getDocs: (...args) => mockGetDocs(...args),
  addDoc: (...args) => mockAddDoc(...args)
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

describe('LancamentoEntradaSaida', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDocs.mockClear();
    mockAddDoc.mockClear();
    mockNavigate.mockClear();
  });

  test('renderiza os campos obrigatórios', async () => {
    render(<LancamentoEntradaSaida />);
    expect(await screen.findByText(/Lançamento de Entrada\/Saída/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tipo \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Produto \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantidade \*/i)).toBeInTheDocument();
    expect(screen.getByText(/Lançar/i)).toBeInTheDocument();
  });

  test('mostra alerta se enviar formulário vazio', async () => {
    window.alert = jest.fn();
    render(<LancamentoEntradaSaida />);
    fireEvent.submit(screen.getByTestId('lancamento-form'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Preencha todos os campos.');
    });
  });

  test('envia entrada válida com sucesso', async () => {
    window.alert = jest.fn();
    render(<LancamentoEntradaSaida />);

    // Aguarda o produto aparecer no select antes de preencher!
    await screen.findByText(/Bateria X/);

    fireEvent.change(screen.getByLabelText(/Tipo \*/i), {
      target: { value: 'entrada' }
    });
    fireEvent.change(screen.getByLabelText(/Produto \*/i), {
      target: { value: '1' }
    });
    fireEvent.change(screen.getByLabelText(/Quantidade \*/i), {
      target: { value: '5' }
    });

    fireEvent.click(screen.getByText(/Lançar/i));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Lançamento registrado com sucesso!');
      expect(mockNavigate).toHaveBeenCalledWith('/estoque');
    });
  });

  test('bloqueia saída maior que estoque', async () => {
    window.alert = jest.fn();
    render(<LancamentoEntradaSaida />);

    // Aguarda o produto aparecer no select antes de preencher!
    await screen.findByText(/Bateria X/);

    fireEvent.change(screen.getByLabelText(/Tipo \*/i), {
      target: { value: 'saida' }
    });
    fireEvent.change(screen.getByLabelText(/Produto \*/i), {
      target: { value: '1' }
    });
    fireEvent.change(screen.getByLabelText(/Quantidade \*/i), {
      target: { value: '100' }
    });

    fireEvent.click(screen.getByText(/Lançar/i));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining('Não há estoque suficiente')
      );
    });
  });
});
