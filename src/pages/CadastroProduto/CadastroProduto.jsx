import React, { useState } from 'react';
import './CadastroProduto.css';

export default function CadastroProduto() {
  const [produto, setProduto] = useState({
    nome: '',
    modelo: '',
    custo: '',
    valorVenda: '',
    quantidadeMinima: '',
    garantia: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProduto((prevProduto) => ({
      ...prevProduto,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log(produto);
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
              placeholder="Enter value"
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
              placeholder="Amperagem(AH) ou tipo"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="custo">Custo *</label>
            <input
              id="custo"
              type="number"
              name="custo"
              value={produto.custo}
              onChange={handleChange}
              placeholder="Enter value"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="valorVenda">Valor Venda *</label>
            <input
              id="valorVenda"
              type="number"
              name="valorVenda"
              value={produto.valorVenda}
              onChange={handleChange}
              placeholder="Enter value"
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
              placeholder="Enter value"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="garantia">Garantia *</label>
            <input
              id="garantia"
              type="number"
              name="garantia"
              value={produto.garantia}
              onChange={handleChange}
              placeholder="(Quantos meses de garantia)"
              required
            />
          </div>

          <button type="submit" className="submit-button">
            Submit
          </button>
        </form>
      </div>
    </div>
  );
}
