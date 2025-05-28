
// Ta funcionando os TESTES!!


// Mocka o módulo que exporta auth, db, analytics para os testes não tentarem inicializar o Firebase real
jest.mock('../../firebase', () => ({
  auth: {}, // pode ser um objeto vazio, pois só queremos evitar o erro
  db: {},   // inclua se seu app importa o db também
  analytics: {}, // só se você exportar analytics também
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from './Login';
import { signInWithEmailAndPassword } from 'firebase/auth';

// Mock do Firebase Auth
jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
}));

// Mock do useNavigate do React Router
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  BrowserRouter: ({ children }) => <div>{children}</div>,
}));

const renderWithRouter = () => render(<Login />);

describe('Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();
  });

  test('renderiza inputs e botão', () => {
    renderWithRouter();
    expect(screen.getByLabelText(/E-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Senha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrar/i })).toBeInTheDocument();
  });

  test('preenche os campos de e-mail e senha', () => {
    renderWithRouter();
    const emailInput = screen.getByLabelText(/E-mail/i);
    const senhaInput = screen.getByLabelText(/Senha/i);

    fireEvent.change(emailInput, { target: { value: 'teste@email.com' } });
    fireEvent.change(senhaInput, { target: { value: '123456' } });

    expect(emailInput.value).toBe('teste@email.com');
    expect(senhaInput.value).toBe('123456');
  });

  test('faz login com sucesso e redireciona', async () => {
    signInWithEmailAndPassword.mockResolvedValueOnce({});
    renderWithRouter();

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
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  test('exibe mensagem de erro se login falhar', async () => {
    signInWithEmailAndPassword.mockRejectedValueOnce(new Error('Auth error'));
    renderWithRouter();

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

    renderWithRouter();

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
