import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CadastroProduto from './CadastroProduto';
import { EstoqueAPI } from '../../services/estoque';
import { EstoqueSomAPI } from '../../services/estoqueSom';

vi.mock('../../services/estoque', () => ({
  EstoqueAPI: {
    criar: vi.fn(),
  },
}));

vi.mock('../../services/estoqueSom', () => ({
  EstoqueSomAPI: {
    criar: vi.fn(),
  },
}));

vi.mock('../../services/estoqueTipos', () => ({
  ESTOQUE_TIPOS: {
    BATERIAS: 'BATERIAS',
    SOM: 'SOM',
  },
  upsertProdutoTipo: vi.fn(),
}));

describe('CadastroProduto', () => {
  beforeEach(() => {
    global.alert = vi.fn();
    vi.clearAllMocks();
  });

  describe('Renderização', () => {
    it('deve renderizar todos os campos do formulário', () => {
      render(<CadastroProduto />);

      expect(screen.getByText('Cadastro de Produto')).toBeInTheDocument();
      expect(screen.getByLabelText(/Nome do Produto/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Modelo/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Custo/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Valor Venda/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Quantidade mínima/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Garantia/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Quantidade Inicial/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cadastrar/i })).toBeInTheDocument();
    });

    it('deve renderizar as opções de tipo de estoque', () => {
      render(<CadastroProduto />);

      expect(screen.getByText('Direcionar para *')).toBeInTheDocument();
      expect(screen.getByText('Estoque de Baterias')).toBeInTheDocument();
      expect(screen.getByText('Estoque do Som')).toBeInTheDocument();
    });

    it('deve ter "Estoque de Baterias" selecionado por padrão', () => {
      render(<CadastroProduto />);
      const bateriasCheckbox = screen.getByRole('checkbox', { name: /Estoque de Baterias/i });
      const somCheckbox = screen.getByRole('checkbox', { name: /Estoque do Som/i });

      expect(bateriasCheckbox).toBeChecked();
      expect(somCheckbox).not.toBeChecked();
    });
  });

  describe('Interação com campos', () => {
    it('deve permitir preencher todos os campos do formulário', async () => {
      const user = userEvent.setup();
      render(<CadastroProduto />);

      await user.type(screen.getByLabelText(/Nome do Produto/i), 'Bateria Moura');
      await user.type(screen.getByLabelText(/Modelo/i), '60A');
      await user.type(screen.getByLabelText(/Custo/i), '250.50');
      await user.type(screen.getByLabelText(/Valor Venda/i), '350.00');
      await user.type(screen.getByLabelText(/Quantidade mínima/i), '5');
      await user.type(screen.getByLabelText(/Garantia/i), '12');
      await user.type(screen.getByLabelText(/Quantidade Inicial/i), '10');

      expect(screen.getByLabelText(/Nome do Produto/i)).toHaveValue('Bateria Moura');
      expect(screen.getByLabelText(/Modelo/i)).toHaveValue('60A');
      expect(screen.getByLabelText(/Custo/i)).toHaveValue(250.5);
      expect(screen.getByLabelText(/Valor Venda/i)).toHaveValue(350);
      expect(screen.getByLabelText(/Quantidade mínima/i)).toHaveValue(5);
      expect(screen.getByLabelText(/Garantia/i)).toHaveValue(12);
      expect(screen.getByLabelText(/Quantidade Inicial/i)).toHaveValue(10);
    });

    it('deve alternar entre tipos de estoque', async () => {
      const user = userEvent.setup();
      render(<CadastroProduto />);

      const bateriasCheckbox = screen.getByRole('checkbox', { name: /Estoque de Baterias/i });
      const somCheckbox = screen.getByRole('checkbox', { name: /Estoque do Som/i });

      expect(bateriasCheckbox).toBeChecked();
      expect(somCheckbox).not.toBeChecked();

      await user.click(somCheckbox);
      expect(somCheckbox).toBeChecked();
      expect(bateriasCheckbox).not.toBeChecked();

      await user.click(bateriasCheckbox);
      expect(bateriasCheckbox).toBeChecked();
      expect(somCheckbox).not.toBeChecked();
    });
  });

  describe('Validações', () => {
    it('deve mostrar alerta quando nome ou modelo estiver vazio', async () => {
      render(<CadastroProduto />);
      fireEvent.submit(screen.getByTestId('cadastro-form'));

      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith('Preencha Nome e Modelo.');
      });
    });

    it('deve mostrar alerta quando custo for zero ou negativo', async () => {
      const user = userEvent.setup();
      render(<CadastroProduto />);

      await user.type(screen.getByLabelText(/Nome do Produto/i), 'Bateria');
      await user.type(screen.getByLabelText(/Modelo/i), '60A');
      await user.type(screen.getByLabelText(/Custo/i), '0');
      await user.type(screen.getByLabelText(/Valor Venda/i), '100');

      fireEvent.submit(screen.getByTestId('cadastro-form'));

      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith(
          'Custo e Valor de Venda devem ser maiores que zero.'
        );
      });
    });

    it('deve mostrar alerta quando valor de venda for zero ou negativo', async () => {
      const user = userEvent.setup();
      render(<CadastroProduto />);

      await user.type(screen.getByLabelText(/Nome do Produto/i), 'Bateria');
      await user.type(screen.getByLabelText(/Modelo/i), '60A');
      await user.type(screen.getByLabelText(/Custo/i), '100');
      await user.type(screen.getByLabelText(/Valor Venda/i), '0');

      fireEvent.submit(screen.getByTestId('cadastro-form'));

      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith(
          'Custo e Valor de Venda devem ser maiores que zero.'
        );
      });
    });
  });

  describe('Cadastro de produto', () => {
    const produtoValido = {
      nome: 'Bateria Moura',
      modelo: '60A',
      custo: '250.50',
      valorVenda: '350.00',
      quantidadeMinima: '5',
      garantia: '12',
      quantidadeInicial: '10',
    };

    it('deve cadastrar produto no estoque de baterias com sucesso e limpar o formulário', async () => {
      const user = userEvent.setup();
      EstoqueAPI.criar.mockResolvedValueOnce({ id: 1 });

      render(<CadastroProduto />);

      await user.type(screen.getByLabelText(/Nome do Produto/i), produtoValido.nome);
      await user.type(screen.getByLabelText(/Modelo/i), produtoValido.modelo);
      await user.type(screen.getByLabelText(/Custo/i), produtoValido.custo);
      await user.type(screen.getByLabelText(/Valor Venda/i), produtoValido.valorVenda);
      await user.type(screen.getByLabelText(/Quantidade mínima/i), produtoValido.quantidadeMinima);
      await user.type(screen.getByLabelText(/Garantia/i), produtoValido.garantia);
      await user.type(screen.getByLabelText(/Quantidade Inicial/i), produtoValido.quantidadeInicial);

      const submitButton = screen.getByRole('button', { name: /Cadastrar/i });
      fireEvent.submit(screen.getByTestId('cadastro-form'));

      // Botão desabilitado durante salvamento
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveTextContent('Salvando...');

      await waitFor(() => {
        expect(EstoqueAPI.criar).toHaveBeenCalled();
        expect(global.alert).toHaveBeenCalledWith('Produto cadastrado com sucesso!');
        expect(screen.getByLabelText(/Nome do Produto/i)).toHaveValue('');
        expect(screen.getByLabelText(/Modelo/i)).toHaveValue('');
        expect(screen.getByLabelText(/Custo/i)).toHaveValue(null);
        expect(screen.getByLabelText(/Valor Venda/i)).toHaveValue(null);
        expect(submitButton).not.toBeDisabled();
        expect(submitButton).toHaveTextContent('Cadastrar');
      });
    });

    it('deve cadastrar produto no estoque do som com sucesso', async () => {
      const user = userEvent.setup();
      EstoqueSomAPI.criar.mockResolvedValueOnce({ id: 2 });

      render(<CadastroProduto />);

      const somCheckbox = screen.getByRole('checkbox', { name: /Estoque do Som/i });
      await user.click(somCheckbox);

      await user.type(screen.getByLabelText(/Nome do Produto/i), 'Alto-falante');
      await user.type(screen.getByLabelText(/Modelo/i), '6 polegadas');
      await user.type(screen.getByLabelText(/Custo/i), '150.00');
      await user.type(screen.getByLabelText(/Valor Venda/i), '200.00');
      await user.type(screen.getByLabelText(/Quantidade mínima/i), '3');
      await user.type(screen.getByLabelText(/Garantia/i), '6');
      await user.type(screen.getByLabelText(/Quantidade Inicial/i), '8');

      fireEvent.submit(screen.getByTestId('cadastro-form'));

      await waitFor(() => {
        expect(EstoqueSomAPI.criar).toHaveBeenCalled();
        expect(EstoqueAPI.criar).not.toHaveBeenCalled();
        expect(global.alert).toHaveBeenCalledWith('Produto cadastrado com sucesso!');
      });
    });

    it('deve mostrar mensagem de erro quando a API falhar', async () => {
      const user = userEvent.setup();
      const errorMessage = 'Erro ao conectar com o servidor';
      EstoqueAPI.criar.mockRejectedValueOnce({
        response: { data: { message: errorMessage } },
      });

      render(<CadastroProduto />);

      await user.type(screen.getByLabelText(/Nome do Produto/i), 'Bateria');
      await user.type(screen.getByLabelText(/Modelo/i), '60A');
      await user.type(screen.getByLabelText(/Custo/i), '100');
      await user.type(screen.getByLabelText(/Valor Venda/i), '150');
      await user.type(screen.getByLabelText(/Quantidade mínima/i), '5');
      await user.type(screen.getByLabelText(/Garantia/i), '12');
      await user.type(screen.getByLabelText(/Quantidade Inicial/i), '10');

      fireEvent.submit(screen.getByTestId('cadastro-form'));

      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith(errorMessage);
      });
    });

    it('deve mostrar mensagem genérica quando erro não tiver mensagem específica', async () => {
      const user = userEvent.setup();
      EstoqueAPI.criar.mockRejectedValueOnce(new Error());

      render(<CadastroProduto />);

      await user.type(screen.getByLabelText(/Nome do Produto/i), 'Bateria');
      await user.type(screen.getByLabelText(/Modelo/i), '60A');
      await user.type(screen.getByLabelText(/Custo/i), '100');
      await user.type(screen.getByLabelText(/Valor Venda/i), '150');
      await user.type(screen.getByLabelText(/Quantidade mínima/i), '5');
      await user.type(screen.getByLabelText(/Garantia/i), '12');
      await user.type(screen.getByLabelText(/Quantidade Inicial/i), '10');

      fireEvent.submit(screen.getByTestId('cadastro-form'));

      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith('Falha ao cadastrar produto');
      });
    });
  });
});
