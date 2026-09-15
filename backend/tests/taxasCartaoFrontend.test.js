import { describe, it, expect } from 'vitest';
import {
  antecipacaoFrac, taxaCreditoEfetivaPct, precoPorParcelas,
} from '../../frontend/src/utils/taxasCartao.js';

// frontend/src/utils/taxasCartao.js é um espelho DELIBERADO do motor de taxas
// do backend (src/utils/taxas.js) — usado pelo Cálculo Rápido do Orçamento
// para mostrar ao cliente a MESMA taxa que o dashboard financeiro usa. Este
// teste garante que as duas cópias não divergem, reusando a tabela de
// referência já validada em tests/taxas.test.js.
const CFG = {
  pix_pct: 0.5,
  debito_pct: 1.36,
  credito_avista_pct: 3.43,
  credito_2a6_pct: 2.36,
  credito_7a12_pct: 2.76,
  antecipacao_mes_pct: 1.96,
};

describe('taxaCreditoEfetivaPct (espelho frontend — precisa bater com backend/src/utils/taxas.js)', () => {
  it('reproduz a tabela de taxa efetiva total confirmada (1x a 10x)', () => {
    const esperado = {
      1: 3.43, 2: 5.23, 3: 6.16, 4: 7.08, 5: 7.98,
      6: 8.88, 7: 10.16, 8: 11.03, 9: 11.90, 10: 12.75,
    };
    for (const [n, pct] of Object.entries(esperado)) {
      expect(taxaCreditoEfetivaPct(Number(n), CFG)).toBeCloseTo(pct, 1);
    }
  });

  it('faixas de intermediação: 2x–6x usa 2,36; 7x–10x usa 2,76 (sem antecipação)', () => {
    const semAntecip = { ...CFG, antecipacao_mes_pct: 0 };
    expect(taxaCreditoEfetivaPct(2, semAntecip)).toBe(2.36);
    expect(taxaCreditoEfetivaPct(6, semAntecip)).toBe(2.36);
    expect(taxaCreditoEfetivaPct(7, semAntecip)).toBe(2.76);
    expect(taxaCreditoEfetivaPct(10, semAntecip)).toBe(2.76);
  });

  it('1x não tem antecipação (só intermediação à vista)', () => {
    expect(antecipacaoFrac(1, CFG.antecipacao_mes_pct)).toBe(0);
    expect(taxaCreditoEfetivaPct(1, CFG)).toBe(3.43);
  });

  it('dentro da MESMA faixa (2x–6x), a taxa efetiva cresce com o nº de parcelas', () => {
    // A intermediação é fixa na faixa, mas a antecipação (custo de receber mais
    // devagar) cresce com N — 2x e 6x NÃO custam o mesmo, mesmo com a mesma
    // base de 2,36%.
    const taxa2x = taxaCreditoEfetivaPct(2, CFG);
    const taxa6x = taxaCreditoEfetivaPct(6, CFG);
    expect(taxa6x).toBeGreaterThan(taxa2x);
  });
});

describe('precoPorParcelas (preço de venda pelo multiplicador 1/(1−taxa), por nº de parcelas)', () => {
  it('R$100 em 10x fecha em R$114,61 (mesmo padrão de TAXA_PARCELADO/precos.js)', () => {
    // taxa efetiva 10x = 12,75% → 100/(1-0,1275) ≈ 114,61
    expect(precoPorParcelas(100, 10, CFG)).toBeCloseTo(114.61, 1);
  });

  it('nº de parcelas maior nunca resulta em preço menor (taxa efetiva é monotônica)', () => {
    const precos = Array.from({ length: 10 }, (_, i) => precoPorParcelas(100, i + 1, CFG));
    for (let i = 1; i < precos.length; i += 1) {
      expect(precos[i]).toBeGreaterThanOrEqual(precos[i - 1]);
    }
  });
});
