import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '../../src/components/ui/Toast.jsx';

// Componente de apoio: expõe os métodos do hook como botões.
function Botoes({ duracao }) {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success('Salvo com sucesso!', duracao)}>ok</button>
      <button onClick={() => toast.error('Falha ao salvar', duracao)}>erro</button>
    </>
  );
}

const renderizar = (duracao) =>
  render(
    <ToastProvider>
      <Botoes duracao={duracao} />
    </ToastProvider>,
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast — mensagens', () => {
  it('toast.success mostra a mensagem como alerta', async () => {
    renderizar();
    await userEvent.click(screen.getByText('ok'));
    expect(screen.getByRole('alert')).toHaveTextContent('Salvo com sucesso!');
  });

  it('toast.error mostra a mensagem de erro', async () => {
    renderizar();
    await userEvent.click(screen.getByText('erro'));
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao salvar');
  });

  it('várias mensagens ficam empilhadas ao mesmo tempo', async () => {
    renderizar();
    await userEvent.click(screen.getByText('ok'));
    await userEvent.click(screen.getByText('erro'));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  it('o botão Fechar remove o toast depois da animação de saída', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderizar();
    await user.click(screen.getByText('ok'));
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    // ainda está na tela durante a animação de saída (300 ms)
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(350); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Toast — tempo de exibição', () => {
  it('sucesso some sozinho depois de 3 segundos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderizar();
    await user.click(screen.getByText('ok'));
    await act(async () => { vi.advanceTimersByTime(2900); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('erro fica mais tempo na tela que o sucesso (4 segundos)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderizar();
    await user.click(screen.getByText('erro'));
    await act(async () => { vi.advanceTimersByTime(3500); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a duração informada na chamada vale mais que a padrão', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderizar(10000);
    await user.click(screen.getByText('ok'));
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('useToast', () => {
  it('usado fora do <ToastProvider> falha com mensagem clara', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Botoes />)).toThrow('useToast deve ser usado dentro de <ToastProvider>');
    erro.mockRestore();
  });
});
