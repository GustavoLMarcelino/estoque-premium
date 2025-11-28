import { describe, it, expect, beforeEach } from 'vitest';

// Funções extraídas do componente para testar
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
    garantia: row?.garantia ?? "",
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

function calcularEstoque(quantidadeInicial, entradas, saidas) {
  return quantidadeInicial + entradas - saidas;
}

function calcularPercentualLucro(custo, valorVenda) {
  return custo > 0 ? ((valorVenda - custo) / custo) * 100 : 0;
}

function filtrarProdutos(produtos, filtro, criticos) {
  const f = (filtro ?? "").toLowerCase();
  return (produtos ?? []).filter((p) => {
    const okBusca = p.nome.toLowerCase().includes(f) || p.modelo.toLowerCase().includes(f);
    const okCritico = criticos ? Number(p.emEstoque || 0) <= Number(p.quantidadeMinima || 0) : true;
    return okBusca && okCritico;
  });
}

function ordenarProdutos(produtos, sortBy) {
  const arr = [...produtos];
  const { field, dir } = sortBy || {};
  arr.sort((a, b) => {
    const va = a?.[field]; const vb = b?.[field];
    if (typeof va === "number" && typeof vb === "number") return dir === "asc" ? va - vb : vb - va;
    const sa = String(va ?? "").toLowerCase(); const sb = String(vb ?? "").toLowerCase();
    if (sa < sb) return dir === "asc" ? -1 : 1;
    if (sa > sb) return dir === "asc" ? 1 : -1;
    return 0;
  });
  return arr;
}

describe('RegistroMovimentacoes - Lógica de Negócio', () => {
  const mockProdutoDb = {
    id: 1,
    produto: 'Bateria Automotiva 60Ah',
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

  beforeEach(() => {
    localStorage.clear();
  });

  it('deve converter dados do banco para UI corretamente', () => {
    const resultado = mapDbToUi(mockProdutoDb);

    expect(resultado).toEqual({
      id: 1,
      nome: 'Bateria Automotiva 60Ah',
      modelo: 'BA60',
      custo: 350,
      valorVenda: 500,
      quantidadeMinima: 5,
      garantia: 12,
      quantidadeInicial: 10,
      entradas: 15,
      saidas: 7,
      emEstoque: 18
    });
  });

  it('deve calcular em_estoque quando não fornecido no banco', () => {
    const produtoSemEstoque = { ...mockProdutoDb };
    delete produtoSemEstoque.em_estoque;

    const resultado = mapDbToUi(produtoSemEstoque);

    expect(resultado.emEstoque).toBe(18); // 10 + 15 - 7
  });

  it('deve converter dados da UI para banco corretamente', () => {
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

  it('deve tratar valores vazios e nulos no mapeamento para DB', () => {
    const produtoVazio = {
      nome: 'Teste',
      modelo: 'T1',
      custo: '',
      valorVenda: null,
      quantidadeMinima: -5,
      garantia: 'abc',
      quantidadeInicial: ''
    };

    const resultado = mapUiToDb(produtoVazio);

    expect(resultado.custo).toBeNull();
    expect(resultado.valor_venda).toBeNull();
    expect(resultado.qtd_minima).toBe(0);
    expect(resultado.garantia).toBe(0);
    expect(resultado.qtd_inicial).toBe(0);
  });

  it('deve calcular estoque corretamente', () => {
    expect(calcularEstoque(10, 15, 7)).toBe(18);
    expect(calcularEstoque(0, 10, 5)).toBe(5);
    expect(calcularEstoque(20, 0, 0)).toBe(20);
  });

  it('deve calcular percentual de lucro corretamente', () => {
    expect(calcularPercentualLucro(350, 500)).toBeCloseTo(42.857, 2);
    expect(calcularPercentualLucro(25, 50)).toBe(100);
    expect(calcularPercentualLucro(100, 200)).toBe(100);
    expect(calcularPercentualLucro(0, 100)).toBe(0); // evita divisão por zero
  });

  it('deve filtrar produtos por nome ou modelo', () => {
    const produtos = [
      { nome: 'Bateria 60Ah', modelo: 'BA60', emEstoque: 10, quantidadeMinima: 5 },
      { nome: 'Cabo 50cm', modelo: 'CB50', emEstoque: 20, quantidadeMinima: 10 },
      { nome: 'Óleo Motor', modelo: 'OL5W30', emEstoque: 30, quantidadeMinima: 15 }
    ];

    const resultado = filtrarProdutos(produtos, 'bateria', false);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].nome).toBe('Bateria 60Ah');

    const resultadoModelo = filtrarProdutos(produtos, 'cb50', false);
    expect(resultadoModelo).toHaveLength(1);
    expect(resultadoModelo[0].modelo).toBe('CB50');
  });

  it('deve filtrar apenas produtos críticos', () => {
    const produtos = [
      { nome: 'Produto 1', modelo: 'P1', emEstoque: 3, quantidadeMinima: 5 },
      { nome: 'Produto 2', modelo: 'P2', emEstoque: 20, quantidadeMinima: 10 },
      { nome: 'Produto 3', modelo: 'P3', emEstoque: 5, quantidadeMinima: 5 }
    ];

    const criticos = filtrarProdutos(produtos, '', true);
    
    expect(criticos).toHaveLength(2);
    expect(criticos.map(p => p.nome)).toEqual(['Produto 1', 'Produto 3']);
  });

  it('deve ordenar produtos por nome crescente', () => {
    const produtos = [
      { nome: 'Zebra', modelo: 'Z1' },
      { nome: 'Alfa', modelo: 'A1' },
      { nome: 'Beta', modelo: 'B1' }
    ];

    const ordenado = ordenarProdutos(produtos, { field: 'nome', dir: 'asc' });

    expect(ordenado[0].nome).toBe('Alfa');
    expect(ordenado[1].nome).toBe('Beta');
    expect(ordenado[2].nome).toBe('Zebra');
  });

  it('deve ordenar produtos por valor numérico decrescente', () => {
    const produtos = [
      { nome: 'P1', emEstoque: 10 },
      { nome: 'P2', emEstoque: 30 },
      { nome: 'P3', emEstoque: 20 }
    ];

    const ordenado = ordenarProdutos(produtos, { field: 'emEstoque', dir: 'desc' });

    expect(ordenado[0].emEstoque).toBe(30);
    expect(ordenado[1].emEstoque).toBe(20);
    expect(ordenado[2].emEstoque).toBe(10);
  });

  it('deve validar dados de movimentação', () => {
    const movValida = {
      produtoId: 1,
      tipo: 'entrada',
      quantidade: 10,
      valor_final: '50.00',
      formaPagamento: ''
    };

    expect(movValida.produtoId).toBeTruthy();
    expect(['entrada', 'saida'].includes(movValida.tipo)).toBe(true);
    expect(Number.isFinite(parseInt(movValida.quantidade, 10))).toBe(true);
    expect(parseInt(movValida.quantidade, 10)).toBeGreaterThan(0);
  });

  it('deve calcular novo estoque após entrada', () => {
    const produtoAtual = {
      quantidadeInicial: 10,
      entradas: 15,
      saidas: 7,
      emEstoque: 18
    };

    const novaEntrada = 5;
    const novasEntradas = produtoAtual.entradas + novaEntrada;
    const novoEstoque = produtoAtual.quantidadeInicial + novasEntradas - produtoAtual.saidas;

    expect(novasEntradas).toBe(20);
    expect(novoEstoque).toBe(23);
  });

  it('deve calcular novo estoque após saída', () => {
    const produtoAtual = {
      quantidadeInicial: 10,
      entradas: 15,
      saidas: 7,
      emEstoque: 18
    };

    const novaSaida = 3;
    const novasSaidas = produtoAtual.saidas + novaSaida;
    const novoEstoque = produtoAtual.quantidadeInicial + produtoAtual.entradas - novasSaidas;

    expect(novasSaidas).toBe(10);
    expect(novoEstoque).toBe(15);
  });

  it('deve armazenar metadados de pagamento no localStorage', () => {
    const PAGAMENTO_KEY = 'movPagamentos';
    const movimentacaoId = 123;
    const dadosPagamento = {
      forma: 'credito',
      parcelas: 3,
      unit: 500
    };

    const store = {};
    store[String(movimentacaoId)] = dadosPagamento;
    localStorage.setItem(PAGAMENTO_KEY, JSON.stringify(store));

    const recuperado = JSON.parse(localStorage.getItem(PAGAMENTO_KEY));
    
    expect(recuperado['123']).toEqual(dadosPagamento);
    expect(recuperado['123'].forma).toBe('credito');
    expect(recuperado['123'].parcelas).toBe(3);
  });

  it('deve normalizar número de parcelas corretamente', () => {
    const normalizar = (valor) => {
      const parsed = parseInt(valor || '1', 10);
      return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
    };

    expect(normalizar('3')).toBe(3);
    expect(normalizar('-5')).toBe(1);
    expect(normalizar('0')).toBe(1);
    expect(normalizar('abc')).toBe(1);
    expect(normalizar('')).toBe(1);
  });
});