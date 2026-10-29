import { describe, it, expect } from 'vitest';
import { maskDateBR, brToIso, isoToBr } from '../../src/utils/dateBR.js';

describe('maskDateBR — máscara dd/mm/aaaa enquanto digita', () => {
  it('insere as barras nos pontos certos', () => {
    expect(maskDateBR('2')).toBe('2');
    expect(maskDateBR('21')).toBe('21');
    expect(maskDateBR('211')).toBe('21/1');
    expect(maskDateBR('2110')).toBe('21/10');
    expect(maskDateBR('21102')).toBe('21/10/2');
    expect(maskDateBR('21102026')).toBe('21/10/2026');
  });

  it('ignora tudo que não é dígito e corta o excesso', () => {
    expect(maskDateBR('21/10/2026')).toBe('21/10/2026');
    expect(maskDateBR('ab21-10.2026xyz99')).toBe('21/10/2026');
  });

  it('vazio e ausente viram string vazia', () => {
    expect(maskDateBR('')).toBe('');
    expect(maskDateBR()).toBe('');
  });
});

describe('brToIso — dd/mm/aaaa para yyyy-mm-dd', () => {
  it('converte uma data válida sem passar por fuso (sem voltar um dia)', () => {
    expect(brToIso('01/01/2026')).toBe('2026-01-01');
    expect(brToIso('31/12/2026')).toBe('2026-12-31');
  });

  it('data incompleta ou fora do formato devolve vazio', () => {
    expect(brToIso('21/10')).toBe('');
    expect(brToIso('2026-10-21')).toBe('');
    expect(brToIso('')).toBe('');
    expect(brToIso()).toBe('');
  });

  it('rejeita dia que não existe: 31/02, 31/04 e 29/02 em ano comum', () => {
    expect(brToIso('31/02/2026')).toBe('');
    expect(brToIso('31/04/2026')).toBe('');
    expect(brToIso('29/02/2026')).toBe('');
    expect(brToIso('00/10/2026')).toBe('');
    expect(brToIso('15/13/2026')).toBe('');
  });

  it('aceita 29/02 em ano bissexto', () => {
    expect(brToIso('29/02/2028')).toBe('2028-02-29');
  });

  it('rejeita anos fora de 1900–2100', () => {
    expect(brToIso('01/01/1899')).toBe('');
    expect(brToIso('01/01/2101')).toBe('');
    expect(brToIso('01/01/1900')).toBe('1900-01-01');
    expect(brToIso('31/12/2100')).toBe('2100-12-31');
  });
});

describe('isoToBr — yyyy-mm-dd para dd/mm/aaaa', () => {
  it('converte data simples e ISO completo, sem aplicar fuso', () => {
    expect(isoToBr('2026-10-21')).toBe('21/10/2026');
    expect(isoToBr('2026-10-21T02:30:00.000Z')).toBe('21/10/2026');
  });

  it('valor inválido, nulo ou ausente devolve vazio', () => {
    expect(isoToBr('21/10/2026')).toBe('');
    expect(isoToBr(null)).toBe('');
    expect(isoToBr()).toBe('');
  });

  it('ida e volta preserva a data', () => {
    expect(isoToBr(brToIso('05/03/2027'))).toBe('05/03/2027');
  });
});
