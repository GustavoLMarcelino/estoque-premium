import { describe, it, expect } from 'vitest';
import { semAcento } from '../../frontend/src/utils/texto.js';

describe('semAcento (normalização acento-insensível para busca)', () => {
  it('remove acento e baixa a caixa: "Câmera de Ré" → "camera de re"', () => {
    expect(semAcento('Câmera de Ré')).toBe('camera de re');
  });

  it('caixa alta acentuada casa com minúscula sem acento: "CÂMERA" → "camera"', () => {
    expect(semAcento('CÂMERA')).toBe('camera');
  });

  it('o bug do relatório: termo sem acento "casa" com o produto acentuado', () => {
    // includes só funciona porque os DOIS lados passam por semAcento
    const produto = semAcento('Câmera de Ré');
    expect(produto.includes(semAcento('camera de re'))).toBe(true);
    expect(produto.includes(semAcento('CAMERA'))).toBe(true);
  });

  it('string já sem acento continua funcionando (idempotente na prática)', () => {
    expect(semAcento('camera de re')).toBe('camera de re');
    expect(semAcento('Bateria 60Ah')).toBe('bateria 60ah');
  });

  it('cobre vários diacríticos comuns do pt-BR', () => {
    expect(semAcento('Ré Câmara Ação Óleo Ônix Über')).toBe('re camara acao oleo onix uber');
    expect(semAcento('coração')).toBe('coracao');
  });

  it('null/undefined/número não quebram (vira string vazia / dígitos)', () => {
    expect(semAcento(null)).toBe('');
    expect(semAcento(undefined)).toBe('');
    expect(semAcento(123)).toBe('123');
  });
});
