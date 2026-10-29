import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const estado = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(),
  opcoes: null,
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (opcoes) => {
    estado.opcoes = opcoes;
    return {
      needRefresh: [estado.needRefresh, estado.setNeedRefresh],
      updateServiceWorker: estado.updateServiceWorker,
    };
  },
}));

import PwaUpdatePrompt from '../../src/components/PwaUpdatePrompt/PwaUpdatePrompt.jsx';

beforeEach(() => {
  estado.needRefresh = false;
  estado.setNeedRefresh.mockClear();
  estado.updateServiceWorker.mockClear();
});

describe('PwaUpdatePrompt', () => {
  it('sem versão nova, não aparece', () => {
    render(<PwaUpdatePrompt />);
    expect(screen.queryByText('Nova versão disponível')).not.toBeInTheDocument();
  });

  it('com versão nova, avisa sem recarregar sozinho', () => {
    estado.needRefresh = true;
    render(<PwaUpdatePrompt />);
    expect(screen.getByText('Nova versão disponível')).toBeInTheDocument();
    expect(estado.updateServiceWorker).not.toHaveBeenCalled();
  });

  it('"Atualizar agora" ativa o service worker novo e recarrega', async () => {
    estado.needRefresh = true;
    render(<PwaUpdatePrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar agora' }));
    expect(estado.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('"Depois" esconde o aviso sem atualizar', async () => {
    estado.needRefresh = true;
    render(<PwaUpdatePrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Depois' }));
    expect(estado.setNeedRefresh).toHaveBeenCalledWith(false);
    expect(estado.updateServiceWorker).not.toHaveBeenCalled();
  });

  it('ao registrar o service worker, passa a checar versão nova quando a aba volta ao foco', () => {
    render(<PwaUpdatePrompt />);
    const registration = { update: vi.fn() };
    estado.opcoes.onRegisteredSW('/sw.js', registration);

    window.dispatchEvent(new Event('focus'));
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('sem registration, não registra nenhum ouvinte', () => {
    render(<PwaUpdatePrompt />);
    expect(() => estado.opcoes.onRegisteredSW('/sw.js', undefined)).not.toThrow();
  });

  it('erro ao registrar o service worker é registrado no console, sem quebrar', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PwaUpdatePrompt />);
    estado.opcoes.onRegisterError(new Error('falhou'));
    expect(erro).toHaveBeenCalledWith('Falha ao registrar o service worker:', expect.any(Error));
    erro.mockRestore();
  });
});
