import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mocks
jest.mock('../../firebase', () => ({
  auth: {
    signOut: jest.fn(() => Promise.resolve())
  }
}));
jest.mock('../../assets/logoSemFundo.png', () => 'logo.png');

const mockUser = { email: 'user@test.com' };
jest.mock('react-firebase-hooks/auth', () => ({
  useAuthState: () => [mockUser]
}));

const mockNavigate = jest.fn();
const mockLocation = { pathname: '/estoque' };
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>
}));

import Sidebar from './sidebar';
import { auth } from '../../firebase'; // Importa para pegar o mock

describe('Sidebar', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renderiza todos os itens de menu', () => {
    render(<Sidebar />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Estoque')).toBeInTheDocument();
    expect(screen.getByText('Cadastro')).toBeInTheDocument();
    expect(screen.getByText('Entrada e Saída')).toBeInTheDocument();
    expect(screen.getByText('Reg. Movimentação')).toBeInTheDocument();
    expect(screen.getByText('Financeiro')).toBeInTheDocument();
  });

  it('destaca o item de menu ativo', () => {
    render(<Sidebar />);
    const estoqueItem = screen.getByText('Estoque').closest('li');
    expect(estoqueItem).toHaveClass('active');
  });

  it('exibe o email do usuário logado', () => {
    render(<Sidebar />);
    expect(screen.getByText(mockUser.email)).toBeInTheDocument();
  });

  it('chama signOut e navega para login ao clicar no botão de logout', async () => {
    render(<Sidebar />);
    const logoutBtn = screen.getByTitle(/logout/i);

    fireEvent.click(logoutBtn);
    await Promise.resolve();

    expect(auth.signOut).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('não exibe email e botão de logout se usuário não está logado', async () => {
    jest.resetModules();
    jest.doMock('react-firebase-hooks/auth', () => ({
      useAuthState: () => [null]
    }));

    const { default: SidebarNoUser } = await import('./sidebar');
    render(<SidebarNoUser />);
    expect(screen.queryByText(mockUser.email)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/logout/i)).not.toBeInTheDocument();

    jest.dontMock('react-firebase-hooks/auth');
  });
});
