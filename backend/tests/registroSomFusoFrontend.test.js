import { describe, it, expect } from 'vitest';
import { hojeBRT } from '../../frontend/src/utils/registroSom.js';
import { diaBRT } from '../src/services/registroSom.js';

// frontend/src/utils/registroSom.js decide o período que a tela pede; o dia em
// que o BACKEND agrupa é o de services/registroSom.js. As duas pontas precisam
// concordar sobre "que dia é este instante" (Brasília), senão um pedido das
// 23h30 aparece num dia no resumo e em outro na lista.

describe('registroSom — front e back concordam sobre o dia', () => {
  it('frontend e backend concordam sobre o dia (Brasília) na virada de fuso', () => {
    for (const iso of ['2026-10-21T02:30:00Z', '2026-10-21T02:59:59Z', '2026-10-21T03:00:00Z', '2026-12-31T23:30:00Z', '2027-01-01T02:59:00Z']) {
      expect(hojeBRT(new Date(iso))).toBe(diaBRT(new Date(iso)));
    }
    expect(hojeBRT(new Date('2026-10-21T02:30:00Z'))).toBe('2026-10-20');
  });
});
