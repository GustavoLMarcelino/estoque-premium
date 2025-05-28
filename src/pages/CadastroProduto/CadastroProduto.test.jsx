
// Ta funcionando o TESTE!!

import { render, screen, fireEvent } from '@testing-library/react';
import CadastroProduto from './CadastroProduto';
import React from 'react';

// Mocka o Firebase para não enviar de verdade
jest.mock('../../firebase', () => ({
  db: {}
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: jest.fn(() => Promise.resolve())
}));

describe('CadastroProduto', () => {
  test('renderiza todos os campos do formulário', () => {
    render(<CadastroProduto />);

    expect(screen.getByLabelText(/Nome do Produto/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Modelo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Custo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Valor Venda/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantidade mínima/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Garantia/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantidade Inicial/i)).toBeInTheDocument();
  });

  test('preenche e envia o formulário com sucesso', async () => {
    render(<CadastroProduto />);

    fireEvent.change(screen.getByLabelText(/Nome do Produto/i), {
      target: { value: 'Bateria XYZ' }
    });
    fireEvent.change(screen.getByLabelText(/Modelo/i), {
      target: { value: '60Ah' }
    });
    fireEvent.change(screen.getByLabelText(/Custo/i), {
      target: { value: '200' }
    });
    fireEvent.change(screen.getByLabelText(/Valor Venda/i), {
      target: { value: '350' }
    });
    fireEvent.change(screen.getByLabelText(/Quantidade mínima/i), {
      target: { value: '3' }
    });
    fireEvent.change(screen.getByLabelText(/Garantia/i), {
      target: { value: '12' }
    });
    fireEvent.change(screen.getByLabelText(/Quantidade Inicial/i), {
      target: { value: '10' }
    });

    fireEvent.click(screen.getByText('Cadastrar'));

    // Espera um alerta de sucesso
    await screen.findByText('Cadastro de Produto');
  });
});
