import { describe, it, expect } from 'vitest';
import { compararValores } from '../../frontend/src/utils/ordenacao.js';

const sinal = (n) => (n < 0 ? -1 : n > 0 ? 1 : 0);

describe('compararValores (comparador de tabela — null explícito, sem coerção)', () => {
  it('SIMETRIA: (número negativo, null) → compare(a,b) e compare(b,a) têm sinais opostos', () => {
    // O bug alvo: guard numérico assimétrico faria -50 < null num sentido e
    // null < -50 no outro. Aqui os dois têm que ser espelho um do outro.
    for (const dir of ['asc', 'desc']) {
      const ab = compararValores(-50, null, dir);
      const ba = compararValores(null, -50, dir);
      expect(sinal(ab)).toBe(-sinal(ba));
      expect(sinal(ab)).not.toBe(0); // não podem empatar (valores distintos)
    }
  });

  it('null vai SEMPRE por último — em asc E em desc', () => {
    // a=número, b=null → número antes (negativo < 0), então null depois:
    expect(compararValores(-50, null, 'asc')).toBeLessThan(0);   // -50 antes de null
    expect(compararValores(-50, null, 'desc')).toBeLessThan(0);  // idem no desc
    expect(compararValores(null, -50, 'asc')).toBeGreaterThan(0); // null depois de -50
    expect(compararValores(null, -50, 'desc')).toBeGreaterThan(0);
  });

  it('dois nulos empatam (0) em qualquer direção', () => {
    expect(compararValores(null, null, 'asc')).toBe(0);
    expect(compararValores(null, undefined, 'desc')).toBe(0);
  });

  it('undefined é tratado como null (== null pega ambos)', () => {
    expect(compararValores(undefined, 10, 'asc')).toBeGreaterThan(0); // undefined ao fim
    expect(compararValores(10, undefined, 'asc')).toBeLessThan(0);
  });

  it('ordem NUMÉRICA, nunca alfabética: 9 < 100 e 1000 > 555', () => {
    expect(compararValores(9, 100, 'asc')).toBeLessThan(0);     // 9 antes de 100
    expect(compararValores(1000, 555, 'asc')).toBeGreaterThan(0); // 1000 depois de 555
    // desc inverte
    expect(compararValores(9, 100, 'desc')).toBeGreaterThan(0);
  });

  it('números respeitam o sinal (negativos ordenam abaixo de positivos)', () => {
    expect(compararValores(-50, 9, 'asc')).toBeLessThan(0);
    expect(compararValores(9, -50, 'asc')).toBeGreaterThan(0);
  });

  it('strings: case-insensitive e direção', () => {
    expect(compararValores('Bateria', 'acdc', 'asc')).toBeGreaterThan(0); // b > a
    expect(compararValores('Bateria', 'acdc', 'desc')).toBeLessThan(0);
  });

  it('ordena uma lista com nulos misturados deixando-os no fim (asc e desc)', () => {
    const base = [100, null, -50, 9, null, 25];
    const asc = [...base].sort((a, b) => compararValores(a, b, 'asc'));
    const desc = [...base].sort((a, b) => compararValores(a, b, 'desc'));
    expect(asc).toEqual([-50, 9, 25, 100, null, null]);
    expect(desc).toEqual([100, 25, 9, -50, null, null]);
  });
});
