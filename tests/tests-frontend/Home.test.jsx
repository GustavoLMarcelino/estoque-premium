// Teste da lógica do Home sem renderizar o componente
describe('Lógica do Componente Home', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Funções de lógica extraídas do componente
  const calcularDadosHome = () => {
    const produtos = JSON.parse(localStorage.getItem('produtos') || '[]');
    const movimentacoes = JSON.parse(localStorage.getItem('movimentacoes') || '[]');

    // 1. Total de produtos
    const totalProdutos = produtos.length;

    // 2. Valor total em estoque
    const valorTotalEstoque = produtos.reduce((total, produto) => {
      const movimentacoesProduto = movimentacoes.filter(m => m.produtoId === produto.id);
      const entradas = movimentacoesProduto
        .filter(m => m.tipo === 'entrada')
        .reduce((sum, m) => sum + m.quantidade, 0);
      const saidas = movimentacoesProduto
        .filter(m => m.tipo === 'saida')
        .reduce((sum, m) => sum + m.quantidade, 0);
      
      const estoqueAtual = (produto.quantidadeInicial || 0) + entradas - saidas;
      return total + (estoqueAtual * (produto.valorVenda || 0));
    }, 0);

    // 3. Produtos críticos (estoque abaixo do mínimo)
    const produtosCriticos = produtos.filter(produto => {
      const movimentacoesProduto = movimentacoes.filter(m => m.produtoId === produto.id);
      const entradas = movimentacoesProduto
        .filter(m => m.tipo === 'entrada')
        .reduce((sum, m) => sum + m.quantidade, 0);
      const saidas = movimentacoesProduto
        .filter(m => m.tipo === 'saida')
        .reduce((sum, m) => sum + m.quantidade, 0);
      
      const estoqueAtual = (produto.quantidadeInicial || 0) + entradas - saidas;
      return estoqueAtual < (produto.quantidadeMinima || 0);
    });

    // 4. Vendas da semana (últimos 7 dias)
    const umaSemanaAtras = new Date();
    umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);
    
    const vendasSemana = movimentacoes
      .filter(m => m.tipo === 'saida' && new Date(m.data) >= umaSemanaAtras)
      .reduce((total, mov) => {
        const produto = produtos.find(p => p.id === mov.produtoId);
        return total + (mov.quantidade * (produto?.valorVenda || 0));
      }, 0);

    // 5. Últimas movimentações (ordenadas por data decrescente)
    const ultimasMovimentacoes = movimentacoes
      .sort((a, b) => new Date(b.data) - new Date(a.data))
      .slice(0, 10)
      .map(mov => {
        const produto = produtos.find(p => p.id === mov.produtoId);
        return {
          ...mov,
          nomeProduto: produto?.nome || 'Produto não encontrado'
        };
      });

    return {
      totalProdutos,
      valorTotalEstoque,
      produtosCriticos: produtosCriticos.length,
      vendasSemana,
      ultimasMovimentacoes
    };
  };

  test('calcula dados corretamente quando não há dados', () => {
    const dados = calcularDadosHome();

    expect(dados.totalProdutos).toBe(0);
    expect(dados.valorTotalEstoque).toBe(0);
    expect(dados.produtosCriticos).toBe(0);
    expect(dados.vendasSemana).toBe(0);
    expect(dados.ultimasMovimentacoes).toHaveLength(0);
  });

  test('calcula dados corretamente com produtos e movimentações', () => {
    // Setup: produtos e movimentações
    const produtos = [
      { 
        id: 1, 
        nome: 'Bateria', 
        valorVenda: 200, 
        quantidadeInicial: 5, 
        quantidadeMinima: 2 
      },
      { 
        id: 2, 
        nome: 'Carregador', 
        valorVenda: 100, 
        quantidadeInicial: 10, 
        quantidadeMinima: 5 
      }
    ];

    const movimentacoes = [
      {
        produtoId: 1,
        tipo: 'saida',
        quantidade: 2,
        data: new Date().toISOString()
      },
      {
        produtoId: 2,
        tipo: 'entrada',
        quantidade: 5,
        data: new Date().toISOString()
      }
    ];

    localStorage.setItem('produtos', JSON.stringify(produtos));
    localStorage.setItem('movimentacoes', JSON.stringify(movimentacoes));

    const dados = calcularDadosHome();

    // Verificações
    expect(dados.totalProdutos).toBe(2);
    
    // Bateria: (5 - 2) * 200 = 600
    // Carregador: (10 + 5) * 100 = 1500
    // Total: 600 + 1500 = 2100
    expect(dados.valorTotalEstoque).toBe(2100);
    
    // Nenhum produto crítico (estoque acima do mínimo)
    expect(dados.produtosCriticos).toBe(0);
    
    // Vendas da semana: saída de 2 baterias (2 * 200 = 400)
    expect(dados.vendasSemana).toBe(400);
    
    // Deve ter 2 movimentações
    expect(dados.ultimasMovimentacoes).toHaveLength(2);
  });

  test('detecta produtos críticos corretamente', () => {
    const produtos = [
      { 
        id: 1, 
        nome: 'Fonte', 
        valorVenda: 150, 
        quantidadeInicial: 1, 
        quantidadeMinima: 3 
      },
      { 
        id: 2, 
        nome: 'Monitor', 
        valorVenda: 500, 
        quantidadeInicial: 10, 
        quantidadeMinima: 2 
      }
    ];

    localStorage.setItem('produtos', JSON.stringify(produtos));

    const dados = calcularDadosHome();

    // Apenas a Fonte está crítica (1 < 3)
    expect(dados.produtosCriticos).toBe(1);
  });

  test('ordena movimentações por data decrescente', () => {
    const produtos = [{ 
      id: 1, 
      nome: 'Notebook', 
      valorVenda: 2000, 
      quantidadeInicial: 5, 
      quantidadeMinima: 1 
    }];

    const movimentacoes = [
      { 
        produtoId: 1, 
        tipo: 'saida', 
        quantidade: 1, 
        data: new Date('2025-01-01').toISOString() 
      },
      { 
        produtoId: 1, 
        tipo: 'saida', 
        quantidade: 2, 
        data: new Date('2025-01-10').toISOString() 
      }
    ];

    localStorage.setItem('produtos', JSON.stringify(produtos));
    localStorage.setItem('movimentacoes', JSON.stringify(movimentacoes));

    const dados = calcularDadosHome();

    // A mais recente deve vir primeiro (quantidade 2)
    expect(dados.ultimasMovimentacoes[0].quantidade).toBe(2);
    expect(dados.ultimasMovimentacoes[1].quantidade).toBe(1);
  });

  test('calcula vendas da semana corretamente', () => {
    const produtos = [{ 
      id: 1, 
      nome: 'Mouse', 
      valorVenda: 50, 
      quantidadeInicial: 10, 
      quantidadeMinima: 2 
    }];

    const hoje = new Date();
    const umaSemanaAtras = new Date(hoje);
    umaSemanaAtras.setDate(hoje.getDate() - 7);
    const duasSemanasAtras = new Date(hoje);
    duasSemanasAtras.setDate(hoje.getDate() - 14);

    const movimentacoes = [
      { 
        produtoId: 1, 
        tipo: 'saida', 
        quantidade: 3, 
        data: hoje.toISOString() // Dentro da semana
      },
      { 
        produtoId: 1, 
        tipo: 'saida', 
        quantidade: 2, 
        data: umaSemanaAtras.toISOString() // Limite da semana (deve contar)
      },
      { 
        produtoId: 1, 
        tipo: 'saida', 
        quantidade: 5, 
        data: duasSemanasAtras.toISOString() // Fora da semana (não deve contar)
      }
    ];

    localStorage.setItem('produtos', JSON.stringify(produtos));
    localStorage.setItem('movimentacoes', JSON.stringify(movimentacoes));

    const dados = calcularDadosHome();

    // Vendas da semana: (3 + 2) * 50 = 250
    expect(dados.vendasSemana).toBe(250);
  });

  test('lida com produtos não encontrados nas movimentações', () => {
    const produtos = [{ 
      id: 1, 
      nome: 'Teclado', 
      valorVenda: 100, 
      quantidadeInicial: 5, 
      quantidadeMinima: 1 
    }];

    const movimentacoes = [
      { 
        produtoId: 999, // ID que não existe
        tipo: 'saida', 
        quantidade: 2, 
        data: new Date().toISOString() 
      }
    ];

    localStorage.setItem('produtos', JSON.stringify(produtos));
    localStorage.setItem('movimentacoes', JSON.stringify(movimentacoes));

    const dados = calcularDadosHome();

    // Deve lidar graciosamente com produto não encontrado
    expect(dados.vendasSemana).toBe(0); // Não deve quebrar
    expect(dados.ultimasMovimentacoes[0].nomeProduto).toBe('Produto não encontrado');
  });
});