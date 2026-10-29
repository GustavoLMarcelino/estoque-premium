import { describe, it, expect, afterEach, vi } from 'vitest';
import { fmtBRL } from '../../src/utils/moeda.js';
import { tempoEmprestada } from '../../src/utils/emprestimos.js';
import { sugerirPercentual } from '../../src/utils/comissaoItem.js';

// O Intl do pt-BR separa "R$" do número com espaço não-quebrável; normaliza
// para comparar com texto normal.
const semNbsp = (s) => s.replace(/\s/g, ' ');

describe('fmtBRL', () => {
  it('formata em reais com milhar e vírgula', () => {
    expect(semNbsp(fmtBRL(1234.5))).toBe('R$ 1.234,50');
    expect(semNbsp(fmtBRL(0.9))).toBe('R$ 0,90');
  });

  it('valor ausente ou não numérico vira R$ 0,00', () => {
    expect(semNbsp(fmtBRL(undefined))).toBe('R$ 0,00');
    expect(semNbsp(fmtBRL(null))).toBe('R$ 0,00');
    expect(semNbsp(fmtBRL('abc'))).toBe('R$ 0,00');
  });

  it('aceita número em string e valores negativos', () => {
    expect(semNbsp(fmtBRL('99.9'))).toBe('R$ 99,90');
    expect(semNbsp(fmtBRL(-10))).toBe('-R$ 10,00');
  });
});

describe('tempoEmprestada', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const agora = (iso) => vi.useFakeTimers().setSystemTime(new Date(iso));

  it('sem data devolve traço', () => {
    expect(tempoEmprestada(null)).toBe('—');
    expect(tempoEmprestada(undefined)).toBe('—');
  });

  it('data inválida devolve traço', () => {
    expect(tempoEmprestada('não é data')).toBe('—');
  });

  it('emprestada há menos de 24h é "hoje"', () => {
    agora('2026-10-21T18:00:00Z');
    expect(tempoEmprestada('2026-10-21T08:00:00Z')).toBe('hoje');
  });

  it('data no futuro (relógio adiantado) também é "hoje", nunca negativo', () => {
    agora('2026-10-21T18:00:00Z');
    expect(tempoEmprestada('2026-10-25T08:00:00Z')).toBe('hoje');
  });

  it('um dia completo é "1 dia", no singular', () => {
    agora('2026-10-21T18:00:00Z');
    expect(tempoEmprestada('2026-10-20T10:00:00Z')).toBe('1 dia');
  });

  it('vários dias no plural', () => {
    agora('2026-10-21T18:00:00Z');
    expect(tempoEmprestada('2026-10-11T18:00:00Z')).toBe('10 dias');
  });
});

describe('sugerirPercentual (comissão de mão de obra)', () => {
  it('serviço de insulfilme sugere 25%, ignorando maiúsculas', () => {
    expect(sugerirPercentual('Insulfilme Padrão')).toBe(25);
    expect(sugerirPercentual('INSULFILME + parabrisa')).toBe(25);
  });

  it('qualquer outro serviço sugere os 30% de Som', () => {
    expect(sugerirPercentual('Instalação de multimídia')).toBe(30);
    expect(sugerirPercentual('')).toBe(30);
    expect(sugerirPercentual(null)).toBe(30);
  });

  it('usa os percentuais da config quando informados', () => {
    expect(sugerirPercentual('Insulfilme', { pctSom: 40, pctInsulfilme: 20 })).toBe(20);
    expect(sugerirPercentual('Alarme', { pctSom: 40, pctInsulfilme: 20 })).toBe(40);
  });
});
