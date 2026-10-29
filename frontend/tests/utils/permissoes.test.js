import { describe, it, expect } from 'vitest';
import {
  GRUPOS_PERMISSOES, TODAS_PERMISSOES_MODULOS, VER_CUSTO, LINHAS, CHAVES_VALIDAS, ROTAS_MODULO,
} from '../../src/utils/permissoes.js';
import {
  PERMISSOES_MODULOS, PERMISSOES_LINHAS, PERMISSAO_VER_CUSTO, PERMISSOES_VALIDAS,
} from '../../../backend/src/utils/permissoes.js';

describe('catálogo de permissões do frontend — espelho do backend', () => {
  it('as telas liberáveis são exatamente as mesmas do backend', () => {
    expect([...TODAS_PERMISSOES_MODULOS].sort()).toEqual([...PERMISSOES_MODULOS].sort());
  });

  it('as chaves de linha e a de ver custo batem com o backend', () => {
    expect(LINHAS.map((l) => l.key).sort()).toEqual([...PERMISSOES_LINHAS].sort());
    expect(VER_CUSTO).toBe(PERMISSAO_VER_CUSTO);
  });

  it('o conjunto de chaves válidas é idêntico ao do backend', () => {
    expect([...CHAVES_VALIDAS].sort()).toEqual([...PERMISSOES_VALIDAS].sort());
  });
});

describe('catálogo de permissões — consistência interna', () => {
  it('nenhuma permissão aparece em dois grupos do menu', () => {
    expect(new Set(TODAS_PERMISSOES_MODULOS).size).toBe(TODAS_PERMISSOES_MODULOS.length);
  });

  it('todo item de grupo tem rótulo para mostrar na tela de usuários', () => {
    for (const grupo of GRUPOS_PERMISSOES) {
      expect(grupo.titulo).toBeTruthy();
      for (const item of grupo.itens) expect(item.label).toBeTruthy();
    }
  });

  it('toda rota do menu pede uma permissão que existe', () => {
    for (const [rota, perm] of ROTAS_MODULO) {
      expect(TODAS_PERMISSOES_MODULOS, `rota ${rota}`).toContain(perm);
    }
  });

  it('toda tela de linha aponta para uma linha conhecida', () => {
    const linhas = LINHAS.map((l) => l.key.replace('linha_', ''));
    for (const [rota, , linha] of ROTAS_MODULO) {
      if (linha) expect(linhas, `rota ${rota}`).toContain(linha);
    }
  });

  it('a Home é a primeira rota do menu (destino padrão após o login)', () => {
    expect(ROTAS_MODULO[0][0]).toBe('/home');
  });
});
