import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

const TEST_ADMIN_EMAIL = 'email'; // substituir por senha e email corretos aqui
const TEST_ADMIN_PASSWORD = 'senha'; // substituir por senha e email corretos aqui
const TEST_INVALID_EMAIL = 'erro@email.com';
const TEST_INVALID_PASSWORD = 'senhaerrada';

const mockLogin = vi.fn();
const mockNavigate = vi.fn();

// Mock do AuthAPI.login
vi.mock('../../services/auth', () => ({
  AuthAPI: {
    login: (...args) => mockLogin(...args)
  }
}));

// Mock do useNavigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Tela de Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve renderizar o formulário de login', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
  });

  it('faz login com credenciais válidas', async () => {
    mockLogin.mockResolvedValueOnce({
      token: 'fake-token',
      user: { id: 1, nome: 'Admin' }
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: TEST_ADMIN_EMAIL }
    });

    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: TEST_ADMIN_PASSWORD }
    });

    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD
      });
      expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true });
    });
  });

  it('mostra erro com credenciais inválidas', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Credenciais inválidas'));

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: TEST_INVALID_EMAIL }
    });

    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: TEST_INVALID_PASSWORD }
    });

    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: TEST_INVALID_EMAIL,
        password: TEST_INVALID_PASSWORD
      });
      expect(screen.getByText('Credenciais inválidas')).toBeInTheDocument();
    });
  });
});