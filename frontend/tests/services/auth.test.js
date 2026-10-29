import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from '../../src/services/api.js';
import {
  getRole, getUsuarioLogado, getPermissoes, temPermissao, temLinha,
  podeVerTela, primeiraRotaPermitida, salvarSessao, AuthAPI,
} from '../../src/services/auth.js';

const logarComo = (role, permissoes = {}) => {
  localStorage.setItem('role', role);
  localStorage.setItem('permissoes', JSON.stringify(permissoes));
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getRole', () => {
  it('prioriza a chave "role" gravada no login', () => {
    localStorage.setItem('role', 'admin');
    localStorage.setItem('usuarioLogado', JSON.stringify({ role: 'user' }));
    expect(getRole()).toBe('admin');
  });

  it('sessão antiga sem "role": cai no papel do usuarioLogado', () => {
    localStorage.setItem('usuarioLogado', JSON.stringify({ role: 'admin' }));
    expect(getRole()).toBe('admin');
  });

  it('sem nada salvo, o padrão seguro é "user" (nunca admin)', () => {
    expect(getRole()).toBe('user');
  });

  it('usuarioLogado corrompido também resulta em "user"', () => {
    localStorage.setItem('usuarioLogado', '{quebrado');
    expect(getRole()).toBe('user');
  });
});

describe('getUsuarioLogado e getPermissoes', () => {
  it('devolve o usuário salvo, ou null quando ausente ou corrompido', () => {
    expect(getUsuarioLogado()).toBeNull();
    localStorage.setItem('usuarioLogado', JSON.stringify({ id: 7, name: 'Ana' }));
    expect(getUsuarioLogado()).toEqual({ id: 7, name: 'Ana' });
    localStorage.setItem('usuarioLogado', 'não é json');
    expect(getUsuarioLogado()).toBeNull();
  });

  it('permissões ausentes, corrompidas ou em formato errado viram objeto vazio', () => {
    expect(getPermissoes()).toEqual({});
    localStorage.setItem('permissoes', 'lixo');
    expect(getPermissoes()).toEqual({});
    localStorage.setItem('permissoes', '["home"]');
    expect(getPermissoes()).toEqual({});
    localStorage.setItem('permissoes', 'null');
    expect(getPermissoes()).toEqual({});
  });

  it('devolve as permissões salvas', () => {
    logarComo('user', { home: true });
    expect(getPermissoes()).toEqual({ home: true });
  });
});

describe('temPermissao', () => {
  it('admin tem qualquer permissão, mesmo sem nenhuma marcada', () => {
    logarComo('admin', {});
    expect(temPermissao('dashboards')).toBe(true);
  });

  it('usuário comum só tem as chaves marcadas como true', () => {
    logarComo('user', { home: true, dashboards: false });
    expect(temPermissao('home')).toBe(true);
    expect(temPermissao('dashboards')).toBe(false);
    expect(temPermissao('garantia')).toBe(false);
  });

  it('com várias chaves, basta uma (OR)', () => {
    logarComo('user', { emprestimos: true });
    expect(temPermissao('garantia', 'emprestimos')).toBe(true);
    expect(temPermissao('garantia', 'consulta_garantia')).toBe(false);
  });

  it('valor truthy que não é true (ex.: "sim") não conta', () => {
    logarComo('user', { home: 'sim' });
    expect(temPermissao('home')).toBe(false);
  });
});

describe('temLinha e podeVerTela', () => {
  it('admin opera qualquer linha', () => {
    logarComo('admin');
    expect(temLinha('som')).toBe(true);
    expect(temLinha('baterias')).toBe(true);
  });

  it('usuário comum precisa da chave linha_<linha>', () => {
    logarComo('user', { linha_som: true });
    expect(temLinha('som')).toBe(true);
    expect(temLinha('baterias')).toBe(false);
  });

  it('tela de linha exige a permissão da tela E a linha', () => {
    logarComo('user', { estoque_som: true });
    expect(podeVerTela('estoque_som', 'som')).toBe(false);
    logarComo('user', { estoque_som: true, linha_som: true });
    expect(podeVerTela('estoque_som', 'som')).toBe(true);
    logarComo('user', { linha_som: true });
    expect(podeVerTela('estoque_som', 'som')).toBe(false);
  });

  it('tela sem linha (transversal) depende só da permissão', () => {
    logarComo('user', { tabela_precos: true });
    expect(podeVerTela('tabela_precos')).toBe(true);
    expect(podeVerTela('home')).toBe(false);
  });
});

describe('primeiraRotaPermitida', () => {
  it('admin sempre cai em /home', () => {
    logarComo('admin');
    expect(primeiraRotaPermitida()).toBe('/home');
  });

  it('respeita a ordem do menu: primeira rota que o usuário pode abrir', () => {
    logarComo('user', { tabela_precos: true, entrada_saida: true });
    expect(primeiraRotaPermitida()).toBe('/tabela-precos');
  });

  it('pula telas de linha quando falta a linha', () => {
    logarComo('user', { estoque_baterias: true, entrada_saida: true });
    expect(primeiraRotaPermitida()).toBe('/entrada-saida');
    logarComo('user', { estoque_baterias: true, linha_baterias: true, entrada_saida: true });
    expect(primeiraRotaPermitida()).toBe('/estoque-baterias');
  });

  it('sem nenhuma permissão devolve null', () => {
    logarComo('user', {});
    expect(primeiraRotaPermitida()).toBeNull();
  });
});

describe('salvarSessao', () => {
  it('grava usuário, papel e permissões no localStorage', () => {
    salvarSessao({ id: 3, role: 'user', permissoes: { home: true } });
    expect(JSON.parse(localStorage.getItem('usuarioLogado'))).toMatchObject({ id: 3 });
    expect(localStorage.getItem('role')).toBe('user');
    expect(JSON.parse(localStorage.getItem('permissoes'))).toEqual({ home: true });
  });

  it('usuário sem role e sem permissões ganha "user" e {}', () => {
    salvarSessao({ id: 4 });
    expect(localStorage.getItem('role')).toBe('user');
    expect(localStorage.getItem('permissoes')).toBe('{}');
  });

  it('sem usuário (null) não grava nada', () => {
    salvarSessao(null);
    expect(localStorage.length).toBe(0);
  });
});

describe('AuthAPI', () => {
  it('login envia email e senha e devolve o corpo da resposta', async () => {
    api.post.mockResolvedValue({ data: { token: 't', user: { id: 1 } } });
    const r = await AuthAPI.login({ email: 'a@b.com', password: 'x' });
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'x' });
    expect(r).toEqual({ token: 't', user: { id: 1 } });
  });

  it('me devolve só o usuário', async () => {
    api.get.mockResolvedValue({ data: { user: { id: 9 } } });
    expect(await AuthAPI.me()).toEqual({ id: 9 });
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });

  it('esqueciSenha e redefinirSenha mandam o corpo esperado', async () => {
    api.post.mockResolvedValue({ data: { ok: true } });
    await AuthAPI.esqueciSenha('a@b.com');
    expect(api.post).toHaveBeenLastCalledWith('/auth/esqueci-senha', { email: 'a@b.com' });
    await AuthAPI.redefinirSenha({ token: 'tk', senha: 'nova-senha-123' });
    expect(api.post).toHaveBeenLastCalledWith('/auth/redefinir-senha', { token: 'tk', senha: 'nova-senha-123' });
  });
});
