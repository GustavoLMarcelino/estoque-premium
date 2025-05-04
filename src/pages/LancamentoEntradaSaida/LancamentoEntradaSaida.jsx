import React, { useState } from 'react';
import './LancamentoEntradaSaida.css';

export default function LancamentoEntradaSaida() {
  const [lancamento, setLancamento] = useState({
    tipo: '',
    produto: '',
    quantidade: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLancamento(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!lancamento.tipo || !lancamento.produto || !lancamento.quantidade) {
      alert("Preencha todos os campos.");
      return;
    }

    console.log("Lançamento realizado:", lancamento);
    alert("Lançamento realizado com sucesso!");

    // Resetar formulário
    setLancamento({
      tipo: '',
      produto: '',
      quantidade: '',
    });
  };

  return (
    <div className="lancamento-page">
      <div className="lancamento-container">
        <h2>Lançamento de Entrada/Saída</h2>
        <form className="lancamento-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Tipo *</label>
            <select name="tipo" value={lancamento.tipo} onChange={handleChange} required>
              <option value="">Selecione</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </div>

          <div className="form-group">
            <label>Produto *</label>
            <input
              type="text"
              name="produto"
              value={lancamento.produto}
              onChange={handleChange}
              placeholder="Nome do Produto"
              required
            />
          </div>

          <div className="form-group">
            <label>Quantidade *</label>
            <input
              type="number"
              name="quantidade"
              value={lancamento.quantidade}
              onChange={handleChange}
              placeholder="Digite a quantidade"
              required
            />
          </div>

          <button type="submit" className="submit-button">Lançar</button>
        </form>
      </div>
    </div>
  );
}
