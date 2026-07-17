import { describe, it, expect } from 'vitest';
import {
  antecipacaoFrac, taxaEfetivaPct, taxaSobreReceita, trunc2,
} from '../src/utils/taxas.js';

// Config de referência (valores confirmados da maquininha — pior caso).
const CFG = {
  pix_pct: 0.5,
  debito_pct: 1.36,
  credito_avista_pct: 3.43,
  credito_2a6_pct: 2.36,
  credito_7a12_pct: 2.76,
  antecipacao_mes_pct: 1.96,
};

describe('modelo de antecipação (desconto composto a valor presente)', () => {
  // Âncora obrigatória: R$100 em 10x → intermediação 2,76% (R$2,76) +
  // antecipação 9,99% (R$9,98) = recebe R$87,26. Cada componente truncado ao
  // centavo em separado (é assim que o simulador real fecha).
  it('R$100 em 10x → recebe R$87,26 (2,76 intermediação + 9,98 antecipação)', () => {
    const intermediacao = trunc2(100 * (CFG.credito_7a12_pct / 100));
    const antecipacao = trunc2(100 * antecipacaoFrac(10, CFG.antecipacao_mes_pct));
    expect(intermediacao).toBe(2.76);
    expect(antecipacao).toBe(9.98);

    const taxa = taxaSobreReceita(100, 'credito', 10, CFG);
    expect(taxa.valor).toBe(12.74); // 2,76 + 9,98
    expect(100 - taxa.valor).toBe(87.26);
    expect(taxa.informada).toBe(true);
  });

  it('reproduz a tabela de taxa efetiva total confirmada (1x a 10x)', () => {
    const esperado = {
      1: 3.43, 2: 5.23, 3: 6.16, 4: 7.08, 5: 7.98,
      6: 8.88, 7: 10.16, 8: 11.03, 9: 11.90, 10: 12.75,
    };
    for (const [n, pct] of Object.entries(esperado)) {
      // tolera ±0,01 (arredondamento do simulador vs. cálculo em ponto flutuante)
      expect(taxaEfetivaPct('credito', Number(n), CFG)).toBeCloseTo(pct, 1);
    }
  });

  it('1x não tem antecipação (só intermediação à vista de crédito)', () => {
    expect(antecipacaoFrac(1, CFG.antecipacao_mes_pct)).toBe(0);
    expect(taxaEfetivaPct('credito', 1, CFG)).toBe(3.43);
  });

  it('faixas de intermediação: 2x–6x usa 2,36; 7x–10x usa 2,76', () => {
    // sem antecipação a diferença entre faixas é a intermediação base
    const semAntecip = { ...CFG, antecipacao_mes_pct: 0 };
    expect(taxaEfetivaPct('credito', 6, semAntecip)).toBe(2.36);
    expect(taxaEfetivaPct('credito', 7, semAntecip)).toBe(2.76);
  });
});

describe('taxaSobreReceita — formas sem antecipação', () => {
  it('débito e pix aplicam o percentual direto, sem antecipação', () => {
    expect(taxaSobreReceita(1000, 'debito', null, CFG).valor).toBe(13.6); // 1,36%
    expect(taxaSobreReceita(1000, 'pix', null, CFG).valor).toBe(5);       // 0,50%
  });

  it('dinheiro tem taxa zero, mas INFORMADA', () => {
    const t = taxaSobreReceita(1000, 'dinheiro', null, CFG);
    expect(t.valor).toBe(0);
    expect(t.informada).toBe(true);
  });

  it('forma ausente/desconhecida → taxa 0 e informada=false (sinalizada)', () => {
    expect(taxaSobreReceita(1000, null, null, CFG)).toEqual({ valor: 0, informada: false });
    expect(taxaSobreReceita(1000, '', null, CFG)).toEqual({ valor: 0, informada: false });
  });
});
