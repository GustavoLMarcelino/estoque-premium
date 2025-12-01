import React, { useState } from 'react';
import './CadastroProduto.css';
import { db } from '../../firebase';
import { collection, addDoc } from 'firebase/firestore';

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
    setProduto((prevProduto) => ({
      ...prevProduto,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await addDoc(collection(db, "produtos"), {
        nome: produto.nome,
        modelo: produto.modelo,
        custo: parseFloat(produto.custo),
        valorVenda: parseFloat(produto.valorVenda),
        quantidadeMinima: parseInt(produto.quantidadeMinima),
        garantia: parseInt(produto.garantia),
        quantidadeInicial: parseInt(produto.quantidadeInicial),
        createdAt: new Date()
      });

      alert("Produto cadastrado com sucesso!");

      setProduto({
        nome: '',
        modelo: '',
        custo: '',
        valorVenda: '',
        quantidadeMinima: '',
        garantia: '',
        quantidadeInicial: ''
      });

    } catch (error) {
      console.error("Erro ao cadastrar produto:", error);
      alert("Erro ao cadastrar produto!");
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
