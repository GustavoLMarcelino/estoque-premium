import { describe, it, expect } from 'vitest';
import {
  basePreco, precosMinimos, margemLiquidaPct, validarMargemMinima,
  rotuloFormaSom, parcelasDoRotulo, calcularPrecos, MARGEM_MINIMA_PCT,
} from '../../src/utils/precos.js';

describe('basePreco', () => {
  it('é custo mais a margem, antes de qualquer taxa', () => {
    expect(basePreco(200, 50)).toBe(300);
    expect(basePreco('100', '10')).toBeCloseTo(110, 10);
  });

  it('custo ou margem ausentes contam como zero', () => {
    expect(basePreco(undefined, 30)).toBe(0);
    expect(basePreco(100, null)).toBe(100);
  });
});

describe('precosMinimos', () => {
  it('é o mesmo cálculo de calcularPrecos com a margem mínima', () => {
    expect(precosMinimos(200)).toEqual(calcularPrecos(200, MARGEM_MINIMA_PCT));
  });
});

describe('margemLiquidaPct', () => {
  it('o preço sugerido com 10% de lucro devolve 10% líquidos nos dois canais', () => {
    const { valor_vista, valor_parcelado } = calcularPrecos(200, 10);
    const m = margemLiquidaPct({ custo: 200, valorVista: valor_vista, valorParcelado: valor_parcelado });
    expect(m.vista).toBeCloseTo(10, 0);
    expect(m.parcelado).toBeCloseTo(10, 0);
  });

  it('sem custo não dá para calcular: devolve null nos dois', () => {
    expect(margemLiquidaPct({ custo: 0, valorVista: 100, valorParcelado: 100 })).toEqual({ vista: null, parcelado: null });
    expect(margemLiquidaPct({ custo: '', valorVista: 100, valorParcelado: 100 })).toEqual({ vista: null, parcelado: null });
  });

  it('preço que não é número fica null só naquele canal', () => {
    const m = margemLiquidaPct({ custo: 100, valorVista: 'abc', valorParcelado: 150 });
    expect(m.vista).toBeNull();
    expect(m.parcelado).not.toBeNull();
  });

  it('preço abaixo do custo dá margem negativa (prejuízo aparece)', () => {
    expect(margemLiquidaPct({ custo: 100, valorVista: 90, valorParcelado: 90 }).vista).toBeLessThan(0);
  });
});

describe('validarMargemMinima (trava anti-prejuízo ao salvar produto)', () => {
  it('preços calculados com 10% de lucro passam raspando', () => {
    const { valor_vista, valor_parcelado } = calcularPrecos(300, 10);
    const r = validarMargemMinima({ custo: 300, valorVista: valor_vista, valorParcelado: valor_parcelado });
    expect(r).toEqual({ ok: true, erros: [], message: '' });
  });

  it('reprova só o canal que ficou abaixo do mínimo, dizendo quanto precisa ser', () => {
    const min = precosMinimos(300);
    const r = validarMargemMinima({ custo: 300, valorVista: min.valor_vista, valorParcelado: 300 });
    expect(r.ok).toBe(false);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]).toMatchObject({ campo: 'valor_parcelado', minimo: min.valor_parcelado, valor: 300 });
    expect(r.message).toMatch(/Preço parcelado \(10x\) abaixo do mínimo/);
    expect(r.message).toMatch(/10% de margem/);
  });

  it('reprova os dois quando os dois estão baixos, juntando as mensagens', () => {
    const r = validarMargemMinima({ custo: 100, valorVista: 100, valorParcelado: 100 });
    expect(r.erros.map((e) => e.campo)).toEqual(['valor_vista', 'valor_parcelado']);
    expect(r.message).toMatch(/Preço à vista.*Preço parcelado/);
  });

  it('preço vazio ou inválido conta como zero e reprova', () => {
    const r = validarMargemMinima({ custo: 100, valorVista: '', valorParcelado: undefined });
    expect(r.ok).toBe(false);
    expect(r.erros.every((e) => e.valor === 0)).toBe(true);
  });

  it('custo zero ou ausente não é assunto da trava: passa direto', () => {
    expect(validarMargemMinima({ custo: 0, valorVista: 1, valorParcelado: 1 }).ok).toBe(true);
    expect(validarMargemMinima({ valorVista: 1 }).ok).toBe(true);
  });
});

describe('rotuloFormaSom', () => {
  it('crédito acima de 1x vira "Crédito Nx"', () => {
    expect(rotuloFormaSom('Crédito parcelado', 10)).toBe('Crédito 10x');
    expect(rotuloFormaSom('credito', '3')).toBe('Crédito 3x');
  });

  it('crédito em 1x, ou sem parcelas, vira "Crédito à vista"', () => {
    expect(rotuloFormaSom('Crédito parcelado', 1)).toBe('Crédito à vista');
    expect(rotuloFormaSom('Crédito à vista', undefined)).toBe('Crédito à vista');
    expect(rotuloFormaSom('credito', 'abc')).toBe('Crédito à vista');
  });

  it('as outras formas passam como vieram, sem espaços sobrando', () => {
    expect(rotuloFormaSom('  PIX ', 5)).toBe('PIX');
    expect(rotuloFormaSom('Débito', 1)).toBe('Débito');
    expect(rotuloFormaSom(null, 1)).toBe('');
  });
});

describe('parcelasDoRotulo', () => {
  it('lê o número de um rótulo de crédito', () => {
    expect(parcelasDoRotulo('Crédito 10x')).toBe(10);
    expect(parcelasDoRotulo('Crédito 3 x')).toBe(3);
  });

  it('rótulo de crédito sem número é ausência de informação (null), não 1x', () => {
    expect(parcelasDoRotulo('Crédito à vista')).toBeNull();
    expect(parcelasDoRotulo('Crédito parcelado')).toBeNull();
  });

  it('forma que não é crédito devolve null mesmo com número no texto', () => {
    expect(parcelasDoRotulo('PIX')).toBeNull();
    expect(parcelasDoRotulo('Débito 2x')).toBeNull();
  });

  it('é o inverso de rotuloFormaSom para 2 a 10 parcelas', () => {
    for (let n = 2; n <= 10; n++) {
      expect(parcelasDoRotulo(rotuloFormaSom('Crédito parcelado', n))).toBe(n);
    }
  });
});
