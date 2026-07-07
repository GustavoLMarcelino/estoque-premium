import { describe, it, expect } from 'vitest';
import { calcularOrcamento, precoUnitario } from '../../frontend/src/utils/orcamento.js';
import { calcularPrecos } from '../../frontend/src/utils/precos.js';

// Mesma disciplina do precos.test.js: a função pura do frontend é testada aqui
// para o gate do CI travar se a fórmula do orçamento mudar sem intenção.
//
// Os itens usam preços REAIS gerados pelo calcularPrecos (a fonte da Tabela de
// Preços): o modo à vista do orçamento deve usar exatamente o valor_vista do
// produto — duas bases de cálculo (débito 1,09% vs parcelado 11,19%) sobre o
// mesmo custo+lucro, e não um desconto percentual sobre o parcelado.

// custo 120, lucro 50% → base 180 → vista 181.96 / parcelado 200.14
const midia = calcularPrecos(120, 50);
// custo 60, lucro 50% → base 90 → vista 90.98 / parcelado 100.07
const camera = calcularPrecos(60, 50);

const item = (precos, qtd = 1) => ({
  precoParcelado: precos.valor_parcelado,
  precoVista: precos.valor_vista,
  qtd,
});

describe('calcularOrcamento — orçamento de som (nada persistido)', () => {
  const itens = [item(midia, 2), item(camera, 1)];
  const cheio = 2 * midia.valor_parcelado + camera.valor_parcelado; // 500.35
  const vista = 2 * midia.valor_vista + camera.valor_vista; // 454.90

  it('parcelado: itens pelo valor_parcelado, sem desconto', () => {
    const r = calcularOrcamento(itens, 0, 'parcelado');
    expect(r.subtotalItens).toBeCloseTo(cheio, 2);
    expect(r.desconto).toBe(0);
    expect(r.total).toBeCloseTo(cheio, 2);
  });

  it('à vista: usa o valor_vista armazenado (idêntico à Tabela de Preços)', () => {
    const r = calcularOrcamento(itens, 0, 'vista');
    expect(r.totalItens).toBeCloseTo(vista, 2);
    expect(r.total).toBeCloseTo(vista, 2);
  });

  it('desconto exibido = diferença real entre as duas bases', () => {
    const r = calcularOrcamento(itens, 0, 'vista');
    expect(r.desconto).toBeCloseTo(cheio - vista, 2);
  });

  it('mão de obra nunca sofre desconto (nos dois modos)', () => {
    const parc = calcularOrcamento(itens, 300, 'parcelado');
    const aVista = calcularOrcamento(itens, 300, 'vista');
    expect(parc.maoDeObra).toBe(300);
    expect(aVista.maoDeObra).toBe(300);
    expect(parc.total).toBeCloseTo(cheio + 300, 2);
    expect(aVista.total).toBeCloseTo(vista + 300, 2);
  });

  it('quantidade multiplica os dois preços', () => {
    const r = calcularOrcamento([item(midia, 4)], 0, 'vista');
    expect(r.totalItens).toBeCloseTo(4 * midia.valor_vista, 2);
    expect(r.subtotalItens).toBeCloseTo(4 * midia.valor_parcelado, 2);
  });

  it('orçamento vazio + só mão de obra', () => {
    const r = calcularOrcamento([], 150, 'vista');
    expect(r).toEqual({ subtotalItens: 0, desconto: 0, totalItens: 0, maoDeObra: 150, total: 150 });
  });

  it('entradas inválidas viram 0 (não NaN)', () => {
    const r = calcularOrcamento(
      [{ precoParcelado: 'abc', precoVista: 'abc', qtd: 2 }, { precoParcelado: 100, precoVista: 90, qtd: null }],
      '',
      'vista',
    );
    expect(r.total).toBe(0);
  });

  it('precoUnitario devolve o preço do modo ativo', () => {
    const it_ = item(midia);
    expect(precoUnitario(it_, 'parcelado')).toBe(midia.valor_parcelado);
    expect(precoUnitario(it_, 'vista')).toBe(midia.valor_vista);
  });
});
