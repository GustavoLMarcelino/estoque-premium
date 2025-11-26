import { describe, it, expect } from 'vitest';

// Funções extraídas do componente Estoque
function formatGarantia(v) {
  if (v === null || v === undefined) return "0 meses";
  const s = String(v).trim();
  if (!s || /nan/i.test(s)) return "0 meses";
  if (s.toLowerCase().includes("mes")) {
    const m = s.match(/\d+/);
    const n = m ? parseInt(m[0], 10) : 0;
    return Number.isFinite(n) ? `${n} meses` : "0 meses";
  }
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? `${n} meses` : "0 meses";
}

function garantiaToNumber(v) {
  if (v === null || v === undefined) return 0;
  const m = String(v).match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

function mapDbToUi(row) {
  const custo = Number(row?.custo ?? 0);
  const valorVenda = Number(row?.valor_venda ?? 0);
  return {
    id: row.id,
    nome: row?.produto ?? "",
    modelo: row?.modelo ?? "",
    custo,
    valorVenda,
    quantidadeMinima: Number(row?.qtd_minima ?? 0),
    garantia: formatGarantia(row?.garantia),
    quantidadeInicial: Number(row?.qtd_inicial ?? 0),
    entradas: Number(row?.entradas ?? 0),
    saidas: Number(row?.saidas ?? 0),
    emEstoque:
      Number(row?.em_estoque ??
        (Number(row?.qtd_inicial ?? 0) + Number(row?.entradas ?? 0) - Number(row?.saidas ?? 0))),
  };
}

function mapUiToDb(p) {
  const toMoney = (n) => (n === "" || n == null ? null : Number(n).toFixed(2));
  const toInt = (n) => {
    const v = parseInt(n, 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  return {
    produto: p.nome,
    modelo: p.modelo,
    custo: toMoney(p.custo),
    valor_venda: toMoney(p.valorVenda),
    qtd_minima: toInt(p.quantidadeMinima),
    garantia: toInt(p.garantia),
    qtd_inicial: toInt(p.quantidadeInicial),
  };
}

function calcularPercentualLucro(custo, valorVenda) {
  return custo > 0 ? ((valorVenda - custo) / custo) * 100 : 0;
}

describe('Estoque', () => {
  it('deve formatar garantia corretamente', () => {
    expect(formatGarantia(12)).toBe('12 meses');
    expect(formatGarantia('18')).toBe('18 meses');
    expect(formatGarantia('24 meses')).toBe('24 meses');
    expect(formatGarantia(null)).toBe('0 meses');
    expect(formatGarantia('NaN')).toBe('0 meses');
  });

  it('deve converter garantia para número', () => {
    expect(garantiaToNumber('12 meses')).toBe(12);
    expect(garantiaToNumber('24')).toBe(24);
    expect(garantiaToNumber(18)).toBe(18);
    expect(garantiaToNumber(null)).toBe(0);
  });

  it('deve mapear DB para UI com garantia formatada', () => {
    const produtoDb = {
      id: 1,
      produto: 'Bateria 60Ah',
      modelo: 'BA60',
      custo: '350.00',
      valor_venda: '500.00',
      qtd_minima: 5,
      garantia: 12,
      qtd_inicial: 10,
      entradas: 15,
      saidas: 7,
      em_estoque: 18
    };

    const resultado = mapDbToUi(produtoDb);

    expect(resultado.garantia).toBe('12 meses');
    expect(resultado.emEstoque).toBe(18);
    expect(resultado.nome).toBe('Bateria 60Ah');
  });

  it('deve mapear UI para DB corretamente', () => {
    const produtoUi = {
      nome: 'Bateria Test',
      modelo: 'BT01',
      custo: 100.50,
      valorVenda: 200.75,
      quantidadeMinima: 5,
      garantia: 12,
      quantidadeInicial: 10
    };

    const resultado = mapUiToDb(produtoUi);

    expect(resultado).toEqual({
      produto: 'Bateria Test',
      modelo: 'BT01',
      custo: '100.50',
      valor_venda: '200.75',
      qtd_minima: 5,
      garantia: 12,
      qtd_inicial: 10
    });
  });

  it('deve calcular percentual de lucro', () => {
    expect(calcularPercentualLucro(350, 500)).toBeCloseTo(42.857, 2);
    expect(calcularPercentualLucro(100, 200)).toBe(100);
    expect(calcularPercentualLucro(0, 100)).toBe(0);
  });

  it('deve atualizar estoque após entrada', () => {
    const produto = {
      quantidadeInicial: 10,
      entradas: 15,
      saidas: 7,
      emEstoque: 18
    };

    const novaEntrada = 5;
    const novasEntradas = produto.entradas + novaEntrada;
    const novoEstoque = produto.quantidadeInicial + novasEntradas - produto.saidas;

    expect(novoEstoque).toBe(23);
  });

  it('deve atualizar estoque após saída', () => {
    const produto = {
      quantidadeInicial: 10,
      entradas: 15,
      saidas: 7,
      emEstoque: 18
    };

    const novaSaida = 3;
    const novasSaidas = produto.saidas + novaSaida;
    const novoEstoque = produto.quantidadeInicial + produto.entradas - novasSaidas;

    expect(novoEstoque).toBe(15);
  });
});