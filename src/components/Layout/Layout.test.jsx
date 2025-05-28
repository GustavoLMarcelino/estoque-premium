// src/components/Layout/Layout.test.jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import Layout from './Layout';

// Mock da Sidebar (evita testes de implementação dela aqui)
jest.mock('../sidebar/sidebar', () => () => <div data-testid="mock-sidebar">Sidebar Mock</div>);

// Mock do Outlet (simula conteúdo da rota filha)
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Outlet: () => <div data-testid="mock-outlet">Outlet Mock Content</div>,
}));

describe('Layout', () => {
  it('renderiza Sidebar e Outlet', () => {
    render(<Layout />);
    // Confere se o Sidebar mockado foi renderizado
    expect(screen.getByTestId('mock-sidebar')).toBeInTheDocument();
    // Confere se o Outlet mockado foi renderizado
    expect(screen.getByTestId('mock-outlet')).toBeInTheDocument();
  });

  it('usa as classes CSS principais', () => {
    render(<Layout />);
    expect(screen.getByRole('main')).toHaveClass('layout-content');
    expect(document.querySelector('.app-layout')).toBeInTheDocument();
  });
});
