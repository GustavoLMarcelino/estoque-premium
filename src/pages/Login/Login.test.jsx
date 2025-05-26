import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from './Login';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock do Firebase Auth
jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
}));

// Wrapper com BrowserRouter para usar useNavigate
const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe('Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renderiza inputs e botão', () => {
    renderWithRouter(<Login />);
    expect(screen.getByLabelText(/E-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Senha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrar/i })).toBeInTheDocument();
  });

  test('preenche os campos de e-mail e senha', () => {
    renderWithRouter(<Login />);
    const emailInput = screen.getByLabelText(/E-mail/i);
    const senhaInput = screen.getByLabelText(/Senha/i);

    fireEvent.change(emailInput, { target: { value: 'teste@email.com' } });
    fireEvent.change(senhaInput, { target: { value: '123456' } });

    expect(emailInput.value).toBe('teste@email.com');
    expect(senhaInput.value).toBe('123456');
  });

  test('faz login com sucesso e redireciona', async () => {
    signInWithEmailAndPassword.mockResolvedValueOnce({});
    renderWithRouter(<Login />);

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'teste@email.com' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: '123456' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    await waitFor(() => {
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'teste@email.com',
        '123456'
      );
    });
  });

  test('exibe mensagem de erro se login falhar', async () => {
    signInWithEmailAndPassword.mockRejectedValueOnce(new Error('Auth error'));
    renderWithRouter(<Login />);

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'teste@email.com' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: '123456' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    await waitFor(() => {
      expect(screen.getByText(/E-mail ou senha inválidos/i)).toBeInTheDocument();
    });
  });

  test('mostra "Entrando…" enquanto faz login', async () => {
    let resolveLogin;
    signInWithEmailAndPassword.mockImplementation(
      () => new Promise((resolve) => (resolveLogin = resolve))
    );

    renderWithRouter(<Login />);

    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'teste@email.com' },
    });
    fireEvent.change(screen.getByLabelText(/Senha/i), {
      target: { value: '123456' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    expect(screen.getByRole('button')).toHaveTextContent('Entrando…');

    resolveLogin(); // Resolve a promise para não travar o teste
  });
});
