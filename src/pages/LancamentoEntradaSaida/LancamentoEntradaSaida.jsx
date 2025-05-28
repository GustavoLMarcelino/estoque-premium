// src/pages/LancamentoEntradaSaida/LancamentoEntradaSaida.jsx
import React, { useState, useEffect } from 'react';
import './LancamentoEntradaSaida.css';
import { db } from '../../firebase';
import {
  collection,
  getDocs,
  addDoc
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export default function LancamentoEntradaSaida() {
  const [produtos, setProdutos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [lancamento, setLancamento] = useState({
    tipo: '',
    produtoId: '',
    quantidade: ''
  });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const prodSnap = await getDocs(collection(db, "produtos"));
      setProdutos(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const movSnap = await getDocs(collection(db, "movimentacoes"));
      setMovimentacoes(movSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchData();
  }, []);

  const handleChange = e => {
    const { name, value } = e.target;
    setLancamento(prev => ({ ...prev, [name]: value }));
  };

  const calculaEstoqueAtual = produtoId => {
    const produto = produtos.find(p => p.id === produtoId);
    if (!produto) return 0;

    const entradas = movimentacoes
      .filter(m => m.produtoId === produtoId && m.tipo === 'entrada')
      .reduce((sum, m) => sum + m.quantidade, 0);
    const saidas = movimentacoes
      .filter(m => m.produtoId === produtoId && m.tipo === 'saida')
      .reduce((sum, m) => sum + m.quantidade, 0);

    return produto.quantidadeInicial + entradas - saidas;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const { tipo, produtoId, quantidade } = lancamento;
    if (!tipo || !produtoId || !quantidade) {
      alert("Preencha todos os campos.");
      return;
    }

    const q = parseInt(quantidade, 10);
    const estoqueAtual = calculaEstoqueAtual(produtoId);

    if (tipo === 'saida' && q > estoqueAtual) {
      alert(`Não há estoque suficiente! Estoque atual: ${estoqueAtual} unidades.`);
      return;
    }

    try {
      await addDoc(collection(db, "movimentacoes"), {
        produtoId,
        tipo,
        quantidade: q,
        data: new Date()
      });
      alert("Lançamento registrado com sucesso!");
      setLancamento({ tipo: '', produtoId: '', quantidade: '' });
      const movSnap = await getDocs(collection(db, "movimentacoes"));
      setMovimentacoes(movSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      navigate('/estoque');
    } catch (err) {
      console.error(err);
      alert("Erro ao registrar movimentação.");
    }
  };

  return (
    <div className="lancamento-page">
      <div className="lancamento-container">
        <h2>Lançamento de Entrada/Saída</h2>
        <form
          className="lancamento-form"
          onSubmit={handleSubmit}
          data-testid="lancamento-form"
          noValidate
        >
          <div className="form-group">
            <label htmlFor="tipo">Tipo *</label>
            <select
              id="tipo"
              name="tipo"
              value={lancamento.tipo}
              onChange={handleChange}
              required
            >
              <option value="">Selecione</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="produtoId">Produto *</label>
            <select
              id="produtoId"
              name="produtoId"
              value={lancamento.produtoId}
              onChange={handleChange}
              required
            >
              <option value="">Selecione o produto</option>
              {produtos.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nome} (Estoque atual: {calculaEstoqueAtual(p.id)})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="quantidade">Quantidade *</label>
            <input
              id="quantidade"
              type="number"
              name="quantidade"
              value={lancamento.quantidade}
              onChange={handleChange}
              placeholder="Digite a quantidade"
              min="1"
              required
            />
          </div>

          <button type="submit" className="submit-button">
            Lançar
          </button>
        </form>
      </div>
    </div>
  );
}
