import React, { useState } from 'react';
import './CadastroProduto.css';

// --- Mock de persistência local (substitui Firestore temporariamente) ---
function saveProductMock(produtoNormalizado) {
  try {
    const key = 'produtos';
    const lista = JSON.parse(localStorage.getItem(key) || '[]');
    lista.push({ id: Date.now(), ...produtoNormalizado });
    localStorage.setItem(key, JSON.stringify(lista));
    return true;
  } catch (e) {
    console.error('Erro ao salvar no localStorage:', e);
    return false;
  }
}

export default function CadastroProduto() {
  const [produto, setProduto] = useState({
    nome: '',
    modelo: '',
    custo: '',
    valorVenda: '',
    quantidadeMinima: '',
    garantia: '',
    quantidadeInicial: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProduto((prev) => ({ ...prev, [name]: value }));
  };

  // Normaliza e valida campos numéricos
  const toNumber = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const produtoNormalizado = {
      nome: String(produto.nome || '').trim(),
      modelo: String(produto.modelo || '').trim(),
      custo: toNumber(produto.custo),
      valorVenda: toNumber(produto.valorVenda),
      quantidadeMinima: Math.max(0, parseInt(produto.quantidadeMinima, 10) || 0),
      garantia: Math.max(0, parseInt(produto.garantia, 10) || 0),
      quantidadeInicial: Math.max(0, parseInt(produto.quantidadeInicial, 10) || 0),
      createdAt: new Date().toISOString()
    };

    // Validações simples do front
    if (!produtoNormalizado.nome || !produtoNormalizado.modelo) {
      alert('Preencha Nome e Modelo.');
      return;
    }
    if (produtoNormalizado.custo <= 0 || produtoNormalizado.valorVenda <= 0) {
      alert('Custo e Valor de Venda devem ser maiores que zero.');
      return;
    }

    const ok = saveProductMock(produtoNormalizado);
    if (ok) {
      alert('Produto cadastrado com sucesso (salvo localmente)!');
      setProduto({
        nome: '',
        modelo: '',
        custo: '',
        valorVenda: '',
        quantidadeMinima: '',
        garantia: '',
        quantidadeInicial: ''
      });
    } else {
      alert('Erro ao cadastrar produto (mock). Veja o console.');
    }
  };

  return (
    <div className="cadastro-page">
      <div className="cadastro-container">
        <h2>Cadastro de Produto</h2>
        <form className="cadastro-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="nome">Nome do Produto *</label>
            <input
              id="nome"
              type="text"
              name="nome"
              value={produto.nome}
              onChange={handleChange}
              placeholder="Digite o nome do produto"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="modelo">Modelo *</label>
            <input
              id="modelo"
              type="text"
              name="modelo"
              value={produto.modelo}
              onChange={handleChange}
              placeholder="Digite o modelo (Amperagem ou Tipo)"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="custo">Custo *</label>
            <input
              id="custo"
              type="number"
              step="0.01"
              name="custo"
              value={produto.custo}
              onChange={handleChange}
              placeholder="Digite o custo"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="valorVenda">Valor Venda *</label>
            <input
              id="valorVenda"
              type="number"
              step="0.01"
              name="valorVenda"
              value={produto.valorVenda}
              onChange={handleChange}
              placeholder="Digite o valor de venda"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="quantidadeMinima">Quantidade mínima *</label>
            <input
              id="quantidadeMinima"
              type="number"
              name="quantidadeMinima"
              value={produto.quantidadeMinima}
              onChange={handleChange}
              placeholder="Digite a quantidade mínima"
              required
              min="0"
            />
          </div>

          <div className="form-group">
            <label htmlFor="garantia">Garantia (Meses) *</label>
            <input
              id="garantia"
              type="number"
              name="garantia"
              value={produto.garantia}
              onChange={handleChange}
              placeholder="Digite o tempo de garantia em meses"
              required
              min="0"
            />
          </div>

          <div className="form-group">
            <label htmlFor="quantidadeInicial">Quantidade Inicial *</label>
            <input
              id="quantidadeInicial"
              type="number"
              name="quantidadeInicial"
              value={produto.quantidadeInicial}
              onChange={handleChange}
              placeholder="Digite a quantidade inicial em estoque"
              required
              min="0"
            />
          </div>

          <button type="submit" className="submit-button">
            Cadastrar
          </button>
        </form>
      </div>
    </div>
  );
}
