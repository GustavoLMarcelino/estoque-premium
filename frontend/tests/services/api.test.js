import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AxiosError } from 'axios';
import api from '../../src/services/api.js';
import { setReauthHandler, requestReauth } from '../../src/services/reauthBridge.js';

// Em vez de bater na rede, troca o adapter do axios por uma fila de respostas:
// os interceptors de request/response rodam de verdade, só o transporte é falso.
let respostas;
let requisicoes;

function responder(status, data = {}) {
  respostas.push({ status, data });
}

beforeEach(() => {
  respostas = [];
  requisicoes = [];
  api.defaults.adapter = async (config) => {
    requisicoes.push({ url: config.url, authorization: config.headers.Authorization });
    const { status, data } = respostas.shift() ?? { status: 200, data: {} };
    const resposta = { data, status, statusText: '', headers: {}, config };
    if (status >= 400) {
      throw new AxiosError(`HTTP ${status}`, 'ERR_BAD_REQUEST', config, null, resposta);
    }
    return resposta;
  };
  setReauthHandler(null);
  vi.stubGlobal('location', { pathname: '/home', assign: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sessaoAberta() {
  localStorage.setItem('token', 'token-velho');
  localStorage.setItem('usuarioLogado', '{"id":1}');
  localStorage.setItem('role', 'admin');
  localStorage.setItem('permissoes', '{}');
}

describe('api — envio do token', () => {
  it('manda o Authorization Bearer quando existe token salvo', async () => {
    localStorage.setItem('token', 'abc123');
    responder(200);
    await api.get('/estoque');
    expect(requisicoes[0].authorization).toBe('Bearer abc123');
  });

  it('não manda Authorization quando não há token', async () => {
    responder(200);
    await api.get('/estoque');
    expect(requisicoes[0].authorization).toBeUndefined();
  });
});

describe('api — erros que não disparam reautenticação', () => {
  it('erro 500 é repassado sem mexer na sessão', async () => {
    sessaoAberta();
    responder(500);
    await expect(api.get('/estoque')).rejects.toMatchObject({ response: { status: 500 } });
    expect(localStorage.getItem('token')).toBe('token-velho');
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('401 sem sessão prévia (senha errada no login) é repassado sem redirecionar', async () => {
    responder(401, { message: 'Credenciais inválidas' });
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('401 numa chamada de auth COM sessão não abre o modal de reautenticação', async () => {
    sessaoAberta();
    const handler = vi.fn();
    setReauthHandler(handler);
    responder(401);
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(handler).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('token-velho');
  });
});

describe('api — sessão expirada em pleno uso (401)', () => {
  it('pede a senha de novo e reenvia a mesma requisição com o token novo', async () => {
    sessaoAberta();
    setReauthHandler(async () => {
      localStorage.setItem('token', 'token-novo');
    });
    responder(401);
    responder(200, { ok: true });

    const res = await api.get('/estoque');

    expect(res.data).toEqual({ ok: true });
    expect(requisicoes).toHaveLength(2);
    expect(requisicoes[0].authorization).toBe('Bearer token-velho');
    expect(requisicoes[1].authorization).toBe('Bearer token-novo');
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('se a reautenticação é cancelada, limpa a sessão e vai para o login', async () => {
    sessaoAberta();
    setReauthHandler(() => Promise.reject(new Error('cancelado')));
    responder(401);

    await expect(api.get('/estoque')).rejects.toMatchObject({ response: { status: 401 } });

    for (const chave of ['token', 'usuarioLogado', 'role', 'permissoes']) {
      expect(localStorage.getItem(chave)).toBeNull();
    }
    expect(window.location.assign).toHaveBeenCalledWith('/login');
  });

  it('sem modal montado, a falha da reautenticação também leva ao login', async () => {
    sessaoAberta();
    responder(401);
    await expect(api.get('/estoque')).rejects.toBeDefined();
    expect(window.location.assign).toHaveBeenCalledWith('/login');
  });

  it('reenvia UMA vez só: novo 401 depois de reautenticar encerra a sessão', async () => {
    sessaoAberta();
    const handler = vi.fn(async () => {
      localStorage.setItem('token', 'token-novo');
    });
    setReauthHandler(handler);
    responder(401);
    responder(401);

    await expect(api.get('/estoque')).rejects.toMatchObject({ response: { status: 401 } });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(requisicoes).toHaveLength(2);
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.assign).toHaveBeenCalledWith('/login');
  });

  it('já estando em /login, limpa a sessão mas não navega de novo', async () => {
    sessaoAberta();
    vi.stubGlobal('location', { pathname: '/login', assign: vi.fn() });
    responder(401);
    await expect(api.get('/estoque')).rejects.toBeDefined();
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});

describe('reauthBridge', () => {
  it('requestReauth rejeita quando nenhum modal registrou o handler', async () => {
    await expect(requestReauth()).rejects.toThrow('ReauthModal não está montado.');
  });

  it('requestReauth devolve o que o handler registrado resolver', async () => {
    setReauthHandler(async () => 'token-novo');
    await expect(requestReauth()).resolves.toBe('token-novo');
  });
});
