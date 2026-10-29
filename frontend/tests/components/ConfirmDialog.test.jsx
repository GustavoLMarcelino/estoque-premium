import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider, useConfirm } from '../../src/components/ui/ConfirmDialog.jsx';

// Componente de apoio: pede confirmação e escreve a resposta na tela.
function Exemplo({ opcoes }) {
  const confirm = useConfirm();
  const [resposta, setResposta] = useState('nenhuma');
  return (
    <>
      <button onClick={async () => setResposta(String(await confirm(opcoes)))}>excluir</button>
      <output>{resposta}</output>
    </>
  );
}

const renderizar = (opcoes) =>
  render(
    <ConfirmProvider>
      <Exemplo opcoes={opcoes} />
    </ConfirmProvider>,
  );

describe('ConfirmDialog — abertura', () => {
  it('não mostra nada até alguém pedir a confirmação', () => {
    renderizar();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mostra os textos padrão quando não recebe opções', async () => {
    renderizar();
    await userEvent.click(screen.getByText('excluir'));
    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveTextContent('Confirmar');
    expect(dialogo).toHaveTextContent('Deseja continuar?');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('usa título, mensagem e rótulos personalizados', async () => {
    renderizar({
      title: 'Excluir venda', message: 'Isso estorna o estoque.',
      confirmLabel: 'Excluir', cancelLabel: 'Voltar',
    });
    await userEvent.click(screen.getByText('excluir'));
    expect(screen.getByRole('heading', { name: 'Excluir venda' })).toBeInTheDocument();
    expect(screen.getByText('Isso estorna o estoque.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
  });
});

describe('ConfirmDialog — resposta', () => {
  it('confirmar resolve true e fecha o diálogo', async () => {
    renderizar();
    await userEvent.click(screen.getByText('excluir'));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('true'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancelar resolve false', async () => {
    renderizar();
    await userEvent.click(screen.getByText('excluir'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('false'));
  });

  it('a tecla Esc cancela', async () => {
    renderizar();
    await userEvent.click(screen.getByText('excluir'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('false'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('clicar no fundo escuro cancela, mas clicar dentro da caixa não', async () => {
    renderizar();
    await userEvent.click(screen.getByText('excluir'));
    await userEvent.click(screen.getByRole('dialog'));
    expect(screen.getByRole('status')).toHaveTextContent('nenhuma');
    // o fundo é o pai direto da caixa do diálogo
    await userEvent.click(screen.getByRole('dialog').parentElement);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('false'));
  });

  it('o botão de confirmar já vem com o foco (Enter confirma)', async () => {
    renderizar();
    await userEvent.click(screen.getByText('excluir'));
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus();
  });
});

describe('useConfirm', () => {
  it('usado fora do <ConfirmProvider> falha com mensagem clara', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Exemplo />)).toThrow('useConfirm deve ser usado dentro de <ConfirmProvider>');
    erro.mockRestore();
  });
});
