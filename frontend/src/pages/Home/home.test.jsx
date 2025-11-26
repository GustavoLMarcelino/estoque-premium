import { describe, it, expect } from 'vitest';

// Funções extraídas do componente Home
const formatCurrency = (v) => {
  const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  return formatter.format(Number.isFinite(v) ? v : 0);
};

const normalizeProduto = (row, source) => {
  const valorVenda = Number(row?.valor_venda ?? row?.valorVenda ?? 0);
  const entradas = Number(row?.entradas ?? 0);
  const saidas = Number(row?.saidas ?? 0);
  const qtdInicial = Number(row?.qtd_inicial ?? 0);
  const emEstoque = Number(row?.em_estoque ?? (qtdInicial + entradas - saidas));
  const qtdMinima = Number(row?.qtd_minima ?? 0);
  const nomeBase = row?.produto ?? row?.nome ?? '';
  const nome = row?.modelo ? `${nomeBase} - ${row.modelo}` : nomeBase;
  return {
    id: row?.id,
    source,
    nome,
    valorVenda: Number.isFinite(valorVenda) ? valorVenda : 0,
    emEstoque: Number.isFinite(emEstoque) ? emEstoque : 0,
    qtdMinima: Number.isFinite(qtdMinima) ? qtdMinima : 0,
  };
};

const normalizeMov = (mov, source, nomeMap, precoMap) => {
  const tipo = String(mov?.tipo || '').toLowerCase();
  const quantidade = Number(mov?.quantidade ?? 0);
  const valorFinal = Number(mov?.valor_final ?? mov?.valorFinal ?? 0);
  const dataStr = mov?.data_movimentacao || mov?.data || mov?.created_at;
  const data = dataStr ? new Date(dataStr) : null;
  const key = `${source}-${mov?.produto_id}`;
  const nome = nomeMap.get(key) || 'Produto';
  const preco = precoMap.get(key) || 0;
  const valorSaida = tipo === 'saida' ? (valorFinal > 0 ? valorFinal : preco * quantidade) : 0;
  return {
    tipo: tipo === 'entrada' ? 'entrada' : 'saida',
    nome,
    quantidade,
    data,
    valorSaida,
    sortKey: data ? data.getTime() : 0,
  };
};

function calcularValorTotal(inventario) {
  return inventario.reduce((acc, p) => acc + p.valorVenda * p.emEstoque, 0);
}

function contarCriticos(inventario) {
  return inventario.filter((p) => p.emEstoque <= p.qtdMinima).length;
}

describe('Home - Dashboard', () => {

  it('deve normalizar produto com cálculo de estoque', () => {
    const produto = {
      id: 1,
      produto: 'Bateria',
      modelo: 'BA60',
      valor_venda: 500,
      qtd_inicial: 10,
      entradas: 15,
      saidas: 7,
      qtd_minima: 5
    };

    const resultado = normalizeProduto(produto, 'b');

    expect(resultado.nome).toBe('Bateria - BA60');
    expect(resultado.emEstoque).toBe(18);
    expect(resultado.valorVenda).toBe(500);
  });

  it('deve normalizar movimentação de saída', () => {
    const nomeMap = new Map([['b-1', 'Bateria 60Ah']]);
    const precoMap = new Map([['b-1', 500]]);

    const mov = {
      produto_id: 1,
      tipo: 'saida',
      quantidade: 2,
      valor_final: 450,
      data_movimentacao: '2024-01-20T15:30:00'
    };

    const resultado = normalizeMov(mov, 'b', nomeMap, precoMap);

    expect(resultado.tipo).toBe('saida');
    expect(resultado.valorSaida).toBe(450);
    expect(resultado.quantidade).toBe(2);
  });

  it('deve calcular valorSaida usando preço quando valor_final inexistente', () => {
    const nomeMap = new Map([['s-2', 'Alto Falante']]);
    const precoMap = new Map([['s-2', 300]]);

    const mov = {
      produto_id: 2,
      tipo: 'saida',
      quantidade: 3,
      data: '2024-01-20T15:30:00'
    };

    const resultado = normalizeMov(mov, 's', nomeMap, precoMap);
    expect(resultado.valorSaida).toBe(900); // 300 * 3
  });

  it('deve calcular valor total do inventário', () => {
    const inventario = [
      { valorVenda: 500, emEstoque: 10 },
      { valorVenda: 300, emEstoque: 5 }
    ];

    expect(calcularValorTotal(inventario)).toBe(6500);
  });

  it('deve contar produtos críticos', () => {
    const inventario = [
      { emEstoque: 3, qtdMinima: 5 },
      { emEstoque: 10, qtdMinima: 5 },
      { emEstoque: 5, qtdMinima: 5 }
    ];

    expect(contarCriticos(inventario)).toBe(2);
  });
});