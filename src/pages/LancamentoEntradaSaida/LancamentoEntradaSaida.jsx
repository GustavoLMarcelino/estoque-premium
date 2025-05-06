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

  // 1) Carrega produtos e movimentações
  useEffect(() => {
    const fetchData = async () => {
      const prodSnap = await getDocs(collection(db, "produtos"));
      setProdutos(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const movSnap = await getDocs(collection(db, "movimentacoes"));
      setMovimentacoes(movSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchData();
  }, []);

  // 2) Atualiza estado do formulário
  const handleChange = e => {
    const { name, value } = e.target;
    setLancamento(prev => ({ ...prev, [name]: value }));
  };

  // 3) Calcula estoque atual de um produto
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

  // 4) Submissão com validação de estoque
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

    // 5) Grava no Firestore
    try {
      await addDoc(collection(db, "movimentacoes"), {
        produtoId,
        tipo,
        quantidade: q,
        data: new Date()
      });
      alert("Lançamento registrado com sucesso!");
      // Limpa formulário
      setLancamento({ tipo: '', produtoId: '', quantidade: '' });
      // Atualiza lista local (puxa de novo ou adiciona ao state)
      const movSnap = await getDocs(collection(db, "movimentacoes"));
      setMovimentacoes(movSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      navigate('/estoque'); // opcional: voltar para Estoque
    } catch (err) {
      console.error(err);
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
            <select
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
            <label>Produto *</label>
            <select
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
            <label>Quantidade *</label>
            <input
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
