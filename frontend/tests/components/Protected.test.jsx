import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Protected, PublicOnly } from '../../src/App.jsx';

function logar({ role = 'user', permissoes = {} } = {}) {
  localStorage.setItem('token', 'tk');
  localStorage.setItem('role', role);
  localStorage.setItem('permissoes', JSON.stringify(permissoes));
}

// Renderiza a rota protegida e as telas de destino como textos simples,
// para ver para onde o usuário foi parar.
function renderizar(elemento, { inicial = '/alvo' } = {}) {
  return render(
    <MemoryRouter initialEntries={[inicial]}>
      <Routes>
        <Route path="/alvo" element={elemento} />
        <Route path="/login" element={<div>tela de login</div>} />
        <Route path="/home" element={<div>tela home</div>} />
        <Route path="/tabela-precos" element={<div>tela tabela de preços</div>} />
        <Route path="/entrada-saida" element={<div>tela entrada e saída</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => localStorage.clear());

describe('Protected — sessão', () => {
  it('sem token, manda para o login', () => {
    renderizar(<Protected><div>conteúdo secreto</div></Protected>);
    expect(screen.getByText('tela de login')).toBeInTheDocument();
    expect(screen.queryByText('conteúdo secreto')).not.toBeInTheDocument();
  });

  it('logado e sem exigência de permissão, mostra o conteúdo', () => {
    logar();
    renderizar(<Protected><div>conteúdo secreto</div></Protected>);
    expect(screen.getByText('conteúdo secreto')).toBeInTheDocument();
  });
});

describe('Protected — permissão de módulo', () => {
  it('usuário com a permissão vê o conteúdo', () => {
    logar({ permissoes: { home: true } });
    renderizar(<Protected perm="home"><div>painel</div></Protected>);
    expect(screen.getByText('painel')).toBeInTheDocument();
  });

  it('admin entra mesmo sem a permissão marcada', () => {
    logar({ role: 'admin' });
    renderizar(<Protected perm="dashboards"><div>painel</div></Protected>);
    expect(screen.getByText('painel')).toBeInTheDocument();
  });

  it('sem a permissão, é redirecionado para a primeira tela que pode abrir', () => {
    logar({ permissoes: { tabela_precos: true, entrada_saida: true } });
    renderizar(<Protected perm="home"><div>painel</div></Protected>);
    expect(screen.getByText('tela tabela de preços')).toBeInTheDocument();
    expect(screen.queryByText('painel')).not.toBeInTheDocument();
  });

  it('sem nenhuma permissão, mostra a tela "Sem acesso" em vez de redirecionar em loop', () => {
    logar({ permissoes: {} });
    renderizar(<Protected perm="home"><div>painel</div></Protected>);
    expect(screen.getByRole('heading', { name: 'Sem acesso' })).toBeInTheDocument();
    expect(screen.getByText(/Fale com o administrador/)).toBeInTheDocument();
  });
});

describe('Protected — escopo de linha', () => {
  it('permissão da tela SEM a linha não basta', () => {
    logar({ permissoes: { estoque_som: true, entrada_saida: true } });
    renderizar(<Protected perm="estoque_som" linha="som"><div>estoque do som</div></Protected>);
    expect(screen.queryByText('estoque do som')).not.toBeInTheDocument();
    expect(screen.getByText('tela entrada e saída')).toBeInTheDocument();
  });

  it('permissão da tela E a linha liberam o acesso', () => {
    logar({ permissoes: { estoque_som: true, linha_som: true } });
    renderizar(<Protected perm="estoque_som" linha="som"><div>estoque do som</div></Protected>);
    expect(screen.getByText('estoque do som')).toBeInTheDocument();
  });

  it('a linha sozinha, sem a permissão da tela, também não basta', () => {
    logar({ permissoes: { linha_som: true } });
    renderizar(<Protected perm="estoque_som" linha="som"><div>estoque do som</div></Protected>);
    expect(screen.queryByText('estoque do som')).not.toBeInTheDocument();
  });
});

describe('Protected — telas só de admin', () => {
  it('usuário comum não entra, mesmo com todas as permissões de módulo', () => {
    logar({ permissoes: { home: true, usuarios: true } });
    renderizar(<Protected adminOnly><div>gestão de usuários</div></Protected>);
    expect(screen.queryByText('gestão de usuários')).not.toBeInTheDocument();
    expect(screen.getByText('tela home')).toBeInTheDocument();
  });

  it('admin entra', () => {
    logar({ role: 'admin' });
    renderizar(<Protected adminOnly><div>gestão de usuários</div></Protected>);
    expect(screen.getByText('gestão de usuários')).toBeInTheDocument();
  });
});

describe('PublicOnly', () => {
  it('deslogado vê a tela pública (login)', () => {
    renderizar(<PublicOnly><div>formulário de login</div></PublicOnly>);
    expect(screen.getByText('formulário de login')).toBeInTheDocument();
  });

  it('já logado é levado para a primeira tela permitida', () => {
    logar({ permissoes: { tabela_precos: true } });
    renderizar(<PublicOnly><div>formulário de login</div></PublicOnly>);
    expect(screen.getByText('tela tabela de preços')).toBeInTheDocument();
  });

  it('logado sem nenhuma tela permitida cai em /home', () => {
    logar({ permissoes: {} });
    renderizar(<PublicOnly><div>formulário de login</div></PublicOnly>);
    expect(screen.getByText('tela home')).toBeInTheDocument();
  });
});
