import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../../src/services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from '../../src/services/api.js';
import EsqueciSenha from '../../src/pages/EsqueciSenha/EsqueciSenha.jsx';
import RedefinirSenha from '../../src/pages/RedefinirSenha/RedefinirSenha.jsx';

// Mostra a mensagem que a redefinição manda para o login via state.
function TelaLogin() {
  const { state } = useLocation();
  return <div>tela de login: {state?.info}</div>;
}

function renderizar(elemento, entrada) {
  return render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route path="/esqueci-senha" element={elemento} />
        <Route path="/redefinir-senha" element={elemento} />
        <Route path="/login" element={<TelaLogin />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('EsqueciSenha', () => {
  const email = () => screen.getByPlaceholderText('seu@email.com');
  const enviar = () => screen.getByRole('button', { name: /Enviar link/ });

  it('e-mail sem ponto no domínio: avisa e não chama a API', async () => {
    renderizar(<EsqueciSenha />, '/esqueci-senha');
    await userEvent.type(email(), 'ana@loja');
    await userEvent.click(enviar());
    expect(screen.getByText('Insira um e-mail válido.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('e-mail válido: pede o link e mostra a confirmação neutra (sem revelar se a conta existe)', async () => {
    api.post.mockResolvedValue({ data: { ok: true } });
    renderizar(<EsqueciSenha />, '/esqueci-senha');
    await userEvent.type(email(), 'ana@loja.com');
    await userEvent.click(enviar());

    expect(api.post).toHaveBeenCalledWith('/auth/esqueci-senha', { email: 'ana@loja.com' });
    expect(await screen.findByText(/Se esse email existir em nossa base/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('seu@email.com')).not.toBeInTheDocument();
  });

  it('falha da API mostra o erro e mantém o formulário para tentar de novo', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Muitas tentativas. Aguarde.' } } });
    renderizar(<EsqueciSenha />, '/esqueci-senha');
    await userEvent.type(email(), 'ana@loja.com');
    await userEvent.click(enviar());
    expect(await screen.findByText('Muitas tentativas. Aguarde.')).toBeInTheDocument();
    expect(enviar()).toBeEnabled();
  });

  it('Voltar para o login navega para /login', async () => {
    renderizar(<EsqueciSenha />, '/esqueci-senha');
    await userEvent.click(screen.getByRole('button', { name: 'Voltar para o login' }));
    expect(screen.getByText(/tela de login/)).toBeInTheDocument();
  });
});

describe('RedefinirSenha', () => {
  const novaSenha = () => screen.getByPlaceholderText('Nova senha');
  const confirmacao = () => screen.getByPlaceholderText('Confirme a nova senha');
  const salvar = () => screen.getByRole('button', { name: 'Redefinir senha' });

  it('link sem token mostra erro e não oferece o formulário', () => {
    renderizar(<RedefinirSenha />, '/redefinir-senha');
    expect(screen.getByText(/Link inválido/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Nova senha')).not.toBeInTheDocument();
  });

  it('senha com menos de 8 caracteres é recusada', async () => {
    renderizar(<RedefinirSenha />, '/redefinir-senha?token=abc');
    await userEvent.type(novaSenha(), '1234567');
    await userEvent.type(confirmacao(), '1234567');
    await userEvent.click(salvar());
    expect(screen.getByText('A nova senha deve ter pelo menos 8 caracteres.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('confirmação diferente da senha é recusada', async () => {
    renderizar(<RedefinirSenha />, '/redefinir-senha?token=abc');
    await userEvent.type(novaSenha(), 'senha-forte-1');
    await userEvent.type(confirmacao(), 'senha-forte-2');
    await userEvent.click(salvar());
    expect(screen.getByText('As senhas não conferem.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('senha válida envia o token do link e volta ao login com a mensagem de sucesso', async () => {
    api.post.mockResolvedValue({ data: { ok: true } });
    renderizar(<RedefinirSenha />, '/redefinir-senha?token=tk-123');
    await userEvent.type(novaSenha(), 'senha-forte-1');
    await userEvent.type(confirmacao(), 'senha-forte-1');
    await userEvent.click(salvar());

    expect(api.post).toHaveBeenCalledWith('/auth/redefinir-senha', { token: 'tk-123', senha: 'senha-forte-1' });
    expect(await screen.findByText(/Senha redefinida com sucesso/)).toBeInTheDocument();
  });

  it('token expirado: mostra o erro do servidor e permite tentar de novo', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Link expirado' } } });
    renderizar(<RedefinirSenha />, '/redefinir-senha?token=velho');
    await userEvent.type(novaSenha(), 'senha-forte-1');
    await userEvent.type(confirmacao(), 'senha-forte-1');
    await userEvent.click(salvar());
    expect(await screen.findByText('Link expirado')).toBeInTheDocument();
    expect(salvar()).toBeEnabled();
  });
});
