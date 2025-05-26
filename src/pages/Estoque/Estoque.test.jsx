import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Estoque from './Estoque';
import { saveAs } from 'file-saver';
import '@testing-library/jest-dom';


// Mocks
jest.mock('../../firebase', () => ({
  db: {},
  auth: {}
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  deleteDoc: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => true, data: () => ({ role: 'admin' }) })),
  updateDoc: jest.fn()
}));

jest.mock('react-firebase-hooks/auth', () => ({
  useAuthState: () => [{ uid: '123' }, false]
}));

jest.mock('file-saver', () => ({
  saveAs: jest.fn()
}));

describe('Estoque', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('renderiza elementos principais', async () => {
    render(<Estoque />);
    expect(await screen.findByText(/Estoque Premium/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Buscar/i)).toBeInTheDocument();
    expect(screen.getByText(/Exportar Excel/i)).toBeInTheDocument();
  });

  test('altera o filtro global ao digitar', async () => {
    render(<Estoque />);
    const input = screen.getByPlaceholderText(/Buscar/i);
    fireEvent.change(input, { target: { value: 'bateria' } });
    expect(input.value).toBe('bateria');
  });

  test('ativa botão Só Críticos', async () => {
    render(<Estoque />);
    const toggle = screen.getByRole('checkbox', { name: /só críticos/i });
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
  });

  test('exibe colunas de admin como % Lucro e Custo', async () => {
    render(<Estoque />);
    await waitFor(() => {
      expect(screen.getByText('% Lucro')).toBeInTheDocument();
      expect(screen.getByText('Custo')).toBeInTheDocument();
    });
  });

  test('botão de Exportar Excel chama saveAs', async () => {
    render(<Estoque />);
    fireEvent.click(screen.getByText(/Exportar Excel/i));
    await waitFor(() => {
      expect(saveAs).toHaveBeenCalled();
    });
  });

  test('renderiza paginação e permite navegação', async () => {
    render(<Estoque />);
    expect(screen.getByText(/Página/i)).toBeInTheDocument();
    const nextBtn = screen.getByText(/Próxima/i);
    fireEvent.click(nextBtn);
    expect(nextBtn).toBeInTheDocument();
  });
});