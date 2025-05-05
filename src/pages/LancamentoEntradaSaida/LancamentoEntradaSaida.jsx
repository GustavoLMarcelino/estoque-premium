import React, { useState, useEffect } from 'react';
import './LancamentoEntradaSaida.css';
import { db } from '../../firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';

export default function LancamentoEntradaSaida() {
  const [produtos, setProdutos] = useState([]);
  const [lancamento, setLancamento] = useState({
    tipo: '',
    produtoId: '',
    quantidade: '',
  });

  // Buscar produtos cadastrados
  useEffect(() => {
    const fetchProdutos = async () => {
      const produtosSnapshot = await getDocs(collection(db, "produtos"));
      const listaProdutos = produtosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProdutos(listaProdutos);
    };

    fetchProdutos();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLancamento(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!lancamento.tipo || !lancamento.produtoId || !lancamento.quantidade) {
      alert("Preencha todos os campos.");
      return;
    }

    const produtoSelecionado = produtos.find(p => p.id === lancamento.produtoId);

    try {
      await addDoc(collection(db, "movimentacoes"), {
        produtoId: produtoSelecionado.id,
        produtoNome: produtoSelecionado.nome,
        tipo: lancamento.tipo,
        quantidade: parseInt(lancamento.quantidade),
        data: new Date()
      });

      alert("Lançamento registrado com sucesso!");

      // Resetar o formulário
      setLancamento({
        tipo: '',
        produtoId: '',
        quantidade: '',
      });
    } catch (error) {
      console.error("Erro ao registrar movimentação:", error);
      alert("Erro ao registrar movimentação.");
    }
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
            <select name="produtoId" value={lancamento.produtoId} onChange={handleChange} required>
              <option value="">Selecione o produto</option>
              {produtos.map(produto => (
                <option key={produto.id} value={produto.id}>{produto.nome}</option>
              ))}
            </select>
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
