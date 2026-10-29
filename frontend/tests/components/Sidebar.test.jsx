import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Sidebar from '../../src/components/sidebar/sidebar.jsx';
import { ConfirmProvider } from '../../src/components/ui/ConfirmDialog.jsx';

function logar({ role = 'user', permissoes = {}, usuario = { name: 'Ana Souza', email: 'ana@loja.com' } } = {}) {
  localStorage.setItem('token', 'tk');
  localStorage.setItem('role', role);
  localStorage.setItem('permissoes', JSON.stringify(permissoes));
  localStorage.setItem('usuarioLogado', JSON.stringify({ ...usuario, role }));
}

function renderizar(entrada = '/home') {
  return render(
    <ConfirmProvider>
      <MemoryRouter initialEntries={[entrada]}>
        <Sidebar />
        <Routes>
          <Route path="/login" element={<div>tela de login</div>} />
          <Route path="*" element={<div>conteúdo</div>} />
        </Routes>
      </MemoryRouter>
    </ConfirmProvider>,
  );
}

const item = (nome) => screen.queryByRole('link', { name: nome });

afterEach(() => localStorage.clear());

describe('Sidebar — itens do menu por permissão', () => {
  it('admin vê todas as telas, inclusive as administrativas e o StockMind', () => {
    logar({ role: 'admin' });
    renderizar();
    for (const nome of [
      'Home', 'Estoque Baterias', 'Estoque Som', 'Orçamento', 'Cadastro', 'Tabela de Preços',
      'Entrada e Saída', 'Reg. Movimentação', 'Pendências de Verificação', 'Dashboards', 'Comissões',
      'Garantia', 'Consulta Garantia', 'Baterias Emprestadas', 'Usuários',
      'Dashboard Inteligente', 'Recomendações',
    ]) {
      expect(item(nome), nome).toBeInTheDocument();
    }
    expect(screen.getByText('StockMind (IA)')).toBeInTheDocument();
  });

  it('usuário comum vê só o que as permissões liberam', () => {
    logar({ permissoes: { home: true, tabela_precos: true, entrada_saida: true } });
    renderizar();
    expect(item('Home')).toBeInTheDocument();
    expect(item('Tabela de Preços')).toBeInTheDocument();
    expect(item('Entrada e Saída')).toBeInTheDocument();
    expect(item('Dashboards')).not.toBeInTheDocument();
    expect(item('Garantia')).not.toBeInTheDocument();
  });

  it('telas administrativas nunca aparecem para usuário comum, mesmo com todas as permissões', () => {
    logar({
      permissoes: {
        home: true, estoque_baterias: true, linha_baterias: true, linha_som: true, dashboards: true,
        cadastro: true, usuarios: true, comissoes: true,
      },
    });
    renderizar();
    for (const nome of ['Cadastro', 'Usuários', 'Comissões', 'Pendências de Verificação', 'Dashboard Inteligente']) {
      expect(item(nome), nome).not.toBeInTheDocument();
    }
    expect(screen.queryByText('StockMind (IA)')).not.toBeInTheDocument();
  });

  it('tela de linha exige a permissão E a linha', () => {
    logar({ permissoes: { estoque_som: true, estoque_baterias: true, linha_baterias: true } });
    renderizar();
    expect(item('Estoque Baterias')).toBeInTheDocument();
    expect(item('Estoque Som')).not.toBeInTheDocument();
  });

  it('o item da rota atual fica marcado como ativo', () => {
    logar({ permissoes: { home: true, tabela_precos: true } });
    renderizar('/tabela-precos');
    expect(item('Tabela de Preços')).toHaveClass('active');
    expect(item('Home')).not.toHaveClass('active');
  });

  it('um grupo sem nenhum item visível some inteiro (sem divisória sobrando)', () => {
    logar({ permissoes: { home: true } });
    const { container } = renderizar();
    expect(container.querySelectorAll('.nav-divider')).toHaveLength(0);
  });
});

describe('Sidebar — usuário logado', () => {
  it('mostra o nome e o papel (usuário)', () => {
    logar({ permissoes: { home: true } });
    renderizar();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('usuário')).toBeInTheDocument();
  });

  it('admin ganha o badge "admin"', () => {
    logar({ role: 'admin' });
    renderizar();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('sem nome salvo, não mostra o bloco de identidade', () => {
    logar({ permissoes: { home: true }, usuario: {} });
    renderizar();
    expect(screen.queryByText('usuário')).not.toBeInTheDocument();
  });
});

describe('Sidebar — recolher e menu mobile', () => {
  it('recolher esconde os rótulos, vira inicial do usuário e lembra a escolha', async () => {
    logar({ permissoes: { home: true } });
    renderizar();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();

    await userEvent.click(screen.getByTitle('Recolher sidebar'));

    expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(localStorage.getItem('sidebarCollapsed')).toBe('true');
    expect(screen.getByTitle('Expandir sidebar')).toBeInTheDocument();
  });

  it('abre já recolhida quando a preferência estava salva', () => {
    logar({ permissoes: { home: true } });
    localStorage.setItem('sidebarCollapsed', 'true');
    renderizar();
    expect(screen.getByTitle('Expandir sidebar')).toBeInTheDocument();
  });

  it('o menu do celular abre pelo hambúrguer e fecha ao escolher uma tela', async () => {
    logar({ permissoes: { home: true, tabela_precos: true } });
    renderizar();
    expect(screen.queryByLabelText('Fechar menu')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Abrir menu'));
    const gaveta = screen.getByLabelText('Fechar menu').closest('aside');
    await userEvent.click(within(gaveta).getByRole('link', { name: 'Tabela de Preços' }));
    expect(screen.queryByLabelText('Fechar menu')).not.toBeInTheDocument();
  });

  it('o botão X fecha o menu do celular', async () => {
    logar({ permissoes: { home: true } });
    renderizar();
    await userEvent.click(screen.getByLabelText('Abrir menu'));
    await userEvent.click(screen.getByLabelText('Fechar menu'));
    expect(screen.queryByLabelText('Fechar menu')).not.toBeInTheDocument();
  });
});

describe('Sidebar — sair do sistema', () => {
  const botaoSair = () => screen.getAllByRole('button', { name: 'Sair' })[0];

  it('pede confirmação e, confirmando, apaga a sessão e vai para o login', async () => {
    logar({ permissoes: { home: true } });
    renderizar();
    await userEvent.click(botaoSair());
    expect(screen.getByText('Tem certeza que deseja sair?')).toBeInTheDocument();

    const dialogo = screen.getByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Sair' }));

    expect(await screen.findByText('tela de login')).toBeInTheDocument();
    for (const chave of ['token', 'usuarioLogado', 'role', 'permissoes']) {
      expect(localStorage.getItem(chave)).toBeNull();
    }
  });

  it('cancelar mantém a sessão e a tela', async () => {
    logar({ permissoes: { home: true } });
    renderizar();
    await userEvent.click(botaoSair());
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(localStorage.getItem('token')).toBe('tk');
    expect(screen.queryByText('tela de login')).not.toBeInTheDocument();
  });
});
