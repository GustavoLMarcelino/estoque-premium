import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LancamentoEntradaSaida from './LancamentoEntradaSaida';
import '@testing-library/jest-dom';

// Mocks
jest.mock('../../firebase', () => ({
  db: {}
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(() => Promise.resolve({
    docs: [
      { id: '1', data: () => ({ nome: 'Bateria X', quantidadeInicial: 10 }) }
    ]
  })),
  addDoc: jest.fn(() => Promise.resolve())
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

describe('LancamentoEntradaSaida', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renderiza os campos obrigatórios', async () => {
    render(<LancamentoEntradaSaida />);
    expect(await screen.findByText(/Lançamento de Entrada\/Saída/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tipo \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Produto \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantidade \*/i)).toBeInTheDocument();
    expect(screen.getByText(/Lançar/i)).toBeInTheDocument();
  });

  test('mostra alerta se enviar formulário vazio', () => {
    window.alert = jest.fn();
    render(<LancamentoEntradaSaida />);
    fireEvent.click(screen.getByText(/Lançar/i));
    expect(window.alert).toHaveBeenCalledWith('Preencha todos os campos.');
  });

  test('envia entrada válida com sucesso', async () => {
    window.alert = jest.fn();
    render(<LancamentoEntradaSaida />);

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

    expect(await screen.findByText(/Lançamento de Entrada\/Saída/i)).toBeInTheDocument();
    expect(window.alert).toHaveBeenCalledWith('Lançamento registrado com sucesso!');
    expect(mockNavigate).toHaveBeenCalledWith('/estoque');
  });

  test('bloqueia saída maior que estoque', async () => {
    window.alert = jest.fn();
    render(<LancamentoEntradaSaida />);

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

    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining('Não há estoque suficiente')
    );
  });
});
