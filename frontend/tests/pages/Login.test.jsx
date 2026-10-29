import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../src/services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from '../../src/services/api.js';
import Login from '../../src/pages/Login/Login.jsx';

function renderizar(entrada = '/login') {
  return render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<div>tela home</div>} />
        <Route path="/tabela-precos" element={<div>tela tabela de preços</div>} />
        <Route path="/esqueci-senha" element={<div>tela esqueci a senha</div>} />
        <Route path="/" element={<div>landing</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const campoEmail = () => screen.getByLabelText('E-mail');
const campoSenha = () => screen.getByLabelText('Senha');
const botaoEntrar = () => screen.getByRole('button', { name: /Entrar/ });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Login — validação no cliente', () => {
  // Texto sem "@" nem chega aqui: o type="email" do campo é barrado pelo próprio
  // navegador. A mensagem do app cobre o que o HTML aceita e o regex dele não
  // (endereço sem ponto no domínio).
  it('e-mail sem ponto no domínio: avisa e não chama a API', async () => {
    renderizar();
    await userEvent.type(campoEmail(), 'ana@loja');
    await userEvent.type(campoSenha(), 'x');
    await userEvent.click(botaoEntrar());
    expect(screen.getByText('Insira um e-mail válido.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sem senha: avisa e não chama a API', async () => {
    renderizar();
    await userEvent.type(campoEmail(), 'ana@loja.com');
    await userEvent.click(botaoEntrar());
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('Login — entrada', () => {
  it('admin entra: grava token e sessão e vai para /home', async () => {
    api.post.mockResolvedValue({
      data: { token: 'tk-novo', user: { id: 1, email: 'ana@loja.com', role: 'admin', permissoes: {} } },
    });
    renderizar();
    await userEvent.type(campoEmail(), 'ana@loja.com');
    await userEvent.type(campoSenha(), 'senha-boa');
    await userEvent.click(botaoEntrar());

    expect(await screen.findByText('tela home')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'ana@loja.com', password: 'senha-boa' });
    expect(localStorage.getItem('token')).toBe('tk-novo');
    expect(localStorage.getItem('role')).toBe('admin');
  });

  it('usuário comum vai para a primeira tela que pode abrir', async () => {
    api.post.mockResolvedValue({
      data: { token: 'tk', user: { id: 2, email: 'bia@loja.com', role: 'user', permissoes: { tabela_precos: true } } },
    });
    renderizar();
    await userEvent.type(campoEmail(), 'bia@loja.com');
    await userEvent.type(campoSenha(), 'senha');
    await userEvent.click(botaoEntrar());
    expect(await screen.findByText('tela tabela de preços')).toBeInTheDocument();
  });

  it('credencial errada mostra a mensagem do servidor e continua na tela', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Credenciais inválidas' } } });
    renderizar();
    await userEvent.type(campoEmail(), 'ana@loja.com');
    await userEvent.type(campoSenha(), 'errada');
    await userEvent.click(botaoEntrar());
    expect(await screen.findByText('Credenciais inválidas')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
    expect(botaoEntrar()).toBeEnabled();
  });

  it('falha de rede sem resposta do servidor usa a mensagem do erro', async () => {
    api.post.mockRejectedValue(new Error('Network Error'));
    renderizar();
    await userEvent.type(campoEmail(), 'ana@loja.com');
    await userEvent.type(campoSenha(), 'x');
    await userEvent.click(botaoEntrar());
    expect(await screen.findByText('Network Error')).toBeInTheDocument();
  });
});

describe('Login — lembrar de mim', () => {
  const loginOk = () => api.post.mockResolvedValue({
    data: { token: 'tk', user: { id: 1, role: 'admin', permissoes: {} } },
  });

  it('marcado, guarda o e-mail para a próxima visita', async () => {
    loginOk();
    renderizar();
    await userEvent.type(campoEmail(), 'ana@loja.com');
    await userEvent.type(campoSenha(), 'x');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lembrar de mim' }));
    await userEvent.click(botaoEntrar());
    await screen.findByText('tela home');
    expect(localStorage.getItem('loginRememberEmail')).toBe('ana@loja.com');
  });

  it('desmarcado, apaga o e-mail guardado antes', async () => {
    localStorage.setItem('loginRememberEmail', 'velho@loja.com');
    loginOk();
    renderizar();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lembrar de mim' }));
    await userEvent.type(campoSenha(), 'x');
    await userEvent.click(botaoEntrar());
    await screen.findByText('tela home');
    expect(localStorage.getItem('loginRememberEmail')).toBeNull();
  });

  it('e-mail guardado já vem preenchido e com a caixa marcada', async () => {
    localStorage.setItem('loginRememberEmail', 'ana@loja.com');
    renderizar();
    await waitFor(() => expect(campoEmail()).toHaveValue('ana@loja.com'));
    expect(screen.getByRole('checkbox', { name: 'Lembrar de mim' })).toBeChecked();
  });
});

describe('Login — recursos da tela', () => {
  it('o botão do olho alterna entre mostrar e ocultar a senha', async () => {
    renderizar();
    expect(campoSenha()).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(campoSenha()).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(campoSenha()).toHaveAttribute('type', 'password');
  });

  it('avisa quando o Caps Lock está ligado e some quando desliga', () => {
    renderizar();
    fireEvent.keyUp(campoSenha(), { key: 'a', modifierCapsLock: true });
    expect(screen.getByText('Caps Lock está ativado.')).toBeInTheDocument();
    fireEvent.keyUp(campoSenha(), { key: 'a', modifierCapsLock: false });
    expect(screen.queryByText('Caps Lock está ativado.')).not.toBeInTheDocument();
  });

  it('mostra a mensagem informativa vinda de outro fluxo (senha redefinida)', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { info: 'Senha redefinida com sucesso.' } }]}>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByText('Senha redefinida com sucesso.')).toBeInTheDocument();
  });

  it('o link "Esqueci minha senha" leva à tela de recuperação', async () => {
    renderizar();
    await userEvent.click(screen.getByRole('link', { name: 'Esqueci minha senha' }));
    expect(screen.getByText('tela esqueci a senha')).toBeInTheDocument();
  });

  it('o botão Voltar leva à landing', async () => {
    renderizar();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar para a landing' }));
    expect(screen.getByText('landing')).toBeInTheDocument();
  });
});
