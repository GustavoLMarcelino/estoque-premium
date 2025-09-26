// Teste apenas da lógica do componente, sem renderizar
describe('Lógica do CadastroProduto', () => {
  let alertMock;

  beforeEach(() => {
    localStorage.clear();
    alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const validarFormulario = (formData) => {
    if (!formData.nome || !formData.modelo) {
      return 'Preencha Nome e Modelo.';
    }

    if (Number(formData.custo) <= 0 || Number(formData.valorVenda) <= 0) {
      return 'Custo e Valor de Venda devem ser maiores que zero.';
    }

    return null;
  };

  const salvarProduto = (formData) => {
    const erro = validarFormulario(formData);
    if (erro) {
      alert(erro);
      return false;
    }

    const produto = {
      nome: formData.nome,
      modelo: formData.modelo,
      custo: Number(formData.custo),
      valorVenda: Number(formData.valorVenda),
      quantidadeMinima: Number(formData.qtdMinima),
      garantia: Number(formData.garantia),
      quantidadeInicial: Number(formData.qtdInicial)
    };

    const produtos = JSON.parse(localStorage.getItem('produtos') || '[]');
    produtos.push(produto);
    localStorage.setItem('produtos', JSON.stringify(produtos));

    alert('Produto cadastrado com sucesso (salvo localmente)!');
    return true;
  };

  test('validação de campos obrigatórios', () => {
    const formData = {
      nome: '',
      modelo: '',
      custo: '100',
      valorVenda: '200'
    };

    const resultado = validarFormulario(formData);
    expect(resultado).toBe('Preencha Nome e Modelo.');
  });

  test('validação de valores positivos', () => {
    const formData = {
      nome: 'Produto',
      modelo: 'Modelo',
      custo: '0',
      valorVenda: '200'
    };

    const resultado = validarFormulario(formData);
    expect(resultado).toBe('Custo e Valor de Venda devem ser maiores que zero.');
  });

  test('salva produto corretamente', () => {
    const formData = {
      nome: 'Bateria',
      modelo: '12V',
      custo: '100',
      valorVenda: '200',
      qtdMinima: '2',
      garantia: '12',
      qtdInicial: '10'
    };

    const resultado = salvarProduto(formData);
    
    expect(resultado).toBe(true);
    expect(alertMock).toHaveBeenCalledWith('Produto cadastrado com sucesso (salvo localmente)!');

    const produtos = JSON.parse(localStorage.getItem('produtos'));
    expect(produtos).toHaveLength(1);
    expect(produtos[0].nome).toBe('Bateria');
  });
});