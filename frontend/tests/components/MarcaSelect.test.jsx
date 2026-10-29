import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/services/marcas.js', () => ({
  MarcasAPI: { listar: vi.fn(), criar: vi.fn() },
}));

import { MarcasAPI } from '../../src/services/marcas.js';
import { ToastProvider } from '../../src/components/ui/Toast.jsx';
import MarcaSelect from '../../src/components/MarcaSelect/MarcaSelect.jsx';

const MOURA = { id: 1, nome: 'Moura' };
const ACDELCO = { id: 2, nome: 'Acdelco' };

async function renderizar(props = {}) {
  const onChange = vi.fn();
  render(
    <ToastProvider>
      <MarcaSelect value={null} onChange={onChange} {...props} />
    </ToastProvider>,
  );
  await screen.findByRole('option', { name: 'Moura' });
  return onChange;
}

const caixa = () => screen.getByRole('combobox');

beforeEach(() => {
  vi.resetAllMocks();
  MarcasAPI.listar.mockResolvedValue([MOURA, ACDELCO]);
});

describe('MarcaSelect — escolher marca', () => {
  it('lista as marcas ativas e a opção de cadastrar uma nova', async () => {
    await renderizar();
    const nomes = screen.getAllByRole('option').map((o) => o.textContent);
    expect(nomes).toEqual(['Selecione a marca', 'Moura', 'Acdelco', '+ Cadastrar nova marca']);
  });

  it('mostra "Carregando marcas…" e trava o campo enquanto busca', async () => {
    let liberar;
    MarcasAPI.listar.mockReturnValue(new Promise((r) => { liberar = r; }));
    render(<ToastProvider><MarcaSelect value={null} onChange={() => {}} /></ToastProvider>);
    expect(screen.getByText('Carregando marcas…')).toBeInTheDocument();
    expect(caixa()).toBeDisabled();
    liberar([MOURA]);
    await waitFor(() => expect(caixa()).toBeEnabled());
  });

  it('escolher uma marca entrega o id numérico', async () => {
    const onChange = await renderizar();
    await userEvent.selectOptions(caixa(), 'Acdelco');
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('voltar para "Selecione a marca" entrega null', async () => {
    const onChange = await renderizar({ value: 1 });
    await userEvent.selectOptions(caixa(), 'Selecione a marca');
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('mostra a marca já selecionada (editar um produto)', async () => {
    await renderizar({ value: 2 });
    expect(caixa()).toHaveValue('2');
  });

  it('falha ao carregar avisa com um toast de erro', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    MarcasAPI.listar.mockRejectedValue(new Error('fora do ar'));
    render(<ToastProvider><MarcaSelect value={null} onChange={() => {}} /></ToastProvider>);
    expect(await screen.findByText('Não foi possível carregar as marcas.')).toBeInTheDocument();
    erro.mockRestore();
  });
});

describe('MarcaSelect — cadastrar marca nova sem sair da tela', () => {
  async function abrirCadastro() {
    const onChange = await renderizar();
    await userEvent.selectOptions(caixa(), '+ Cadastrar nova marca');
    return onChange;
  }

  it('escolher "+ Cadastrar nova marca" troca o select por um campo de texto', async () => {
    const onChange = await abrirCadastro();
    expect(screen.getByPlaceholderText('Nome da nova marca')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('nome com menos de 2 letras é recusado, sem chamar a API', async () => {
    await abrirCadastro();
    await userEvent.type(screen.getByPlaceholderText('Nome da nova marca'), ' a ');
    await userEvent.click(screen.getByTitle('Salvar marca'));
    expect(await screen.findByText('Informe o nome da marca (mínimo 2 letras).')).toBeInTheDocument();
    expect(MarcasAPI.criar).not.toHaveBeenCalled();
  });

  it('salvar cria a marca, seleciona ela e volta ao select com a lista em ordem alfabética', async () => {
    MarcasAPI.criar.mockResolvedValue({ id: 3, nome: 'Bosch' });
    const onChange = await abrirCadastro();
    await userEvent.type(screen.getByPlaceholderText('Nome da nova marca'), '  Bosch ');
    await userEvent.click(screen.getByTitle('Salvar marca'));

    expect(await screen.findByText('Marca "Bosch" cadastrada.')).toBeInTheDocument();
    expect(MarcasAPI.criar).toHaveBeenCalledWith('Bosch');
    expect(onChange).toHaveBeenCalledWith(3);
    const nomes = screen.getAllByRole('option').map((o) => o.textContent);
    expect(nomes).toEqual(['Selecione a marca', 'Acdelco', 'Bosch', 'Moura', '+ Cadastrar nova marca']);
  });

  it('Enter salva sem precisar do botão', async () => {
    MarcasAPI.criar.mockResolvedValue({ id: 3, nome: 'Bosch' });
    await abrirCadastro();
    await userEvent.type(screen.getByPlaceholderText('Nome da nova marca'), 'Bosch{Enter}');
    await waitFor(() => expect(MarcasAPI.criar).toHaveBeenCalledWith('Bosch'));
  });

  it('erro do servidor (marca repetida) aparece e mantém o campo para corrigir', async () => {
    MarcasAPI.criar.mockRejectedValue({ response: { data: { message: 'Marca já cadastrada.' } } });
    const onChange = await abrirCadastro();
    await userEvent.type(screen.getByPlaceholderText('Nome da nova marca'), 'Moura');
    await userEvent.click(screen.getByTitle('Salvar marca'));

    expect(await screen.findByText('Marca já cadastrada.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Nome da nova marca')).toHaveValue('Moura');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Esc e o botão Cancelar voltam ao select sem salvar nada', async () => {
    await abrirCadastro();
    await userEvent.type(screen.getByPlaceholderText('Nome da nova marca'), 'Teste{Escape}');
    expect(caixa()).toBeInTheDocument();

    await userEvent.selectOptions(caixa(), '+ Cadastrar nova marca');
    await userEvent.click(screen.getByTitle('Cancelar'));
    expect(caixa()).toBeInTheDocument();
    expect(MarcasAPI.criar).not.toHaveBeenCalled();
  });
});
