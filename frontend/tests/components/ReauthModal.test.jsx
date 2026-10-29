import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from '../../src/services/api.js';
import ReauthModal from '../../src/components/ReauthModal/ReauthModal.jsx';
import { requestReauth } from '../../src/services/reauthBridge.js';

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem('usuarioLogado', JSON.stringify({ id: 1, email: 'ana@loja.com' }));
  localStorage.setItem('token', 'token-velho');
  vi.stubGlobal('location', { pathname: '/home', assign: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Dispara o pedido de reautenticação como o interceptor do axios faria.
// O ReauthModal é uma ponte: só abre quando alguém chama requestReauth().
function pedirReautenticacao() {
  let promessa;
  act(() => {
    promessa = requestReauth();
  });
  return promessa;
}

describe('ReauthModal — abertura', () => {
  it('fica invisível enquanto a sessão está válida', () => {
    render(<ReauthModal />);
    expect(screen.queryByText('Sessão expirada')).not.toBeInTheDocument();
  });

  it('abre quando o interceptor pede reautenticação, mostrando o email da sessão', async () => {
    render(<ReauthModal />);
    pedirReautenticacao();
    expect(await screen.findByText('Sessão expirada')).toBeInTheDocument();
    expect(screen.getByText('ana@loja.com')).toBeInTheDocument();
  });

  it('o botão Continuar só habilita com a senha preenchida', async () => {
    render(<ReauthModal />);
    pedirReautenticacao();
    const continuar = await screen.findByRole('button', { name: 'Continuar' });
    expect(continuar).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('Sua senha'), 'x');
    expect(continuar).toBeEnabled();
  });
});

describe('ReauthModal — senha', () => {
  it('senha certa: grava o token novo, fecha e resolve o pedido original', async () => {
    api.post.mockResolvedValue({ data: { token: 'token-novo', user: { id: 1, role: 'admin', permissoes: {}, email: 'ana@loja.com' } } });
    render(<ReauthModal />);
    const promessa = pedirReautenticacao();
    await userEvent.type(await screen.findByPlaceholderText('Sua senha'), 'minha-senha');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await expect(promessa).resolves.toBe('token-novo');
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'ana@loja.com', password: 'minha-senha' });
    expect(localStorage.getItem('token')).toBe('token-novo');
    expect(localStorage.getItem('role')).toBe('admin');
    await waitFor(() => expect(screen.queryByText('Sessão expirada')).not.toBeInTheDocument());
  });

  it('senha errada: mostra o erro do servidor e mantém o modal aberto', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Credenciais inválidas' } } });
    render(<ReauthModal />);
    pedirReautenticacao();
    await userEvent.type(await screen.findByPlaceholderText('Sua senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText('Credenciais inválidas')).toBeInTheDocument();
    expect(screen.getByText('Sessão expirada')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBe('token-velho');
  });

  it('falha sem mensagem do servidor cai no texto "Senha incorreta."', async () => {
    api.post.mockRejectedValue(new Error('rede'));
    render(<ReauthModal />);
    pedirReautenticacao();
    await userEvent.type(await screen.findByPlaceholderText('Sua senha'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Senha incorreta.')).toBeInTheDocument();
  });
});

describe('ReauthModal — cancelar e vários 401 juntos', () => {
  it('Sair rejeita o pedido, apaga a sessão e vai para o login', async () => {
    render(<ReauthModal />);
    const promessa = pedirReautenticacao();
    const rejeicao = expect(promessa).rejects.toThrow('Reautenticação cancelada.');
    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));

    await rejeicao;
    for (const chave of ['token', 'usuarioLogado', 'role', 'permissoes']) {
      expect(localStorage.getItem(chave)).toBeNull();
    }
    expect(window.location.assign).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('Sessão expirada')).not.toBeInTheDocument();
  });

  it('várias requisições com 401 compartilham UM modal e todas recebem o mesmo token', async () => {
    api.post.mockResolvedValue({ data: { token: 'token-novo', user: { id: 1, email: 'ana@loja.com' } } });
    render(<ReauthModal />);
    const todas = Promise.all([pedirReautenticacao(), pedirReautenticacao(), pedirReautenticacao()]);
    expect(await screen.findAllByText('Sessão expirada')).toHaveLength(1);

    await userEvent.type(screen.getByPlaceholderText('Sua senha'), 'senha');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await expect(todas).resolves.toEqual(['token-novo', 'token-novo', 'token-novo']);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('sem usuário salvo na sessão, não há com quem reautenticar: cai no login', async () => {
    localStorage.removeItem('usuarioLogado');
    render(<ReauthModal />);
    const promessa = pedirReautenticacao();
    const rejeicao = expect(promessa).rejects.toThrow('Reautenticação cancelada.');
    await userEvent.type(await screen.findByPlaceholderText('Sua senha'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await rejeicao;
    expect(api.post).not.toHaveBeenCalled();
    expect(window.location.assign).toHaveBeenCalledWith('/login');
  });

  it('ao desmontar, o modal desregistra a ponte (requisições futuras falham limpo)', async () => {
    const { unmount } = render(<ReauthModal />);
    unmount();
    await expect(requestReauth()).rejects.toThrow('ReauthModal não está montado.');
  });
});
