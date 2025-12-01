import React, { useEffect, useState, useMemo } from 'react';
import './home.css';
import { db } from '../../firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

export default function Home() {
  const [produtos, setProdutos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const produtosSnap = await getDocs(collection(db, 'produtos'));
      const produtosList = produtosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const movQuery = query(collection(db, 'movimentacoes'), orderBy('data', 'desc'));
      const movSnap = await getDocs(movQuery);
      const movList = movSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setProdutos(produtosList);
      setMovimentacoes(movList);
      setCarregado(true);
    };

    fetchData();
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      window.location.reload();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // ✅ Valor total baseado em valorVenda
  const valorTotal = useMemo(() => {
    if (!carregado) return 0;

    return produtos.reduce((total, p) => {
      const valorVenda = typeof p.valorVenda === 'number' ? p.valorVenda : 0;
      const quantidadeInicial = typeof p.quantidadeInicial === 'number' ? p.quantidadeInicial : 0;

      const entradas = movimentacoes
        .filter(m => m.produtoId === p.id && m.tipo === 'entrada')
        .reduce((acc, m) => acc + (m.quantidade ?? 0), 0);

      const saidas = movimentacoes
        .filter(m => m.produtoId === p.id && m.tipo === 'saida')
        .reduce((acc, m) => acc + (m.quantidade ?? 0), 0);

      const estoqueAtual = quantidadeInicial + entradas - saidas;

      return total + (valorVenda * estoqueAtual);
    }, 0);
  }, [carregado, produtos, movimentacoes]);

  // ✅ Produtos críticos com estoqueAtual <= quantidadeMinima
  const produtosCriticos = useMemo(() => {
    if (!carregado) return [];

    return produtos.filter(p => {
      const quantidadeMinima = typeof p.quantidadeMinima === 'number' ? p.quantidadeMinima : 0;
      const quantidadeInicial = typeof p.quantidadeInicial === 'number' ? p.quantidadeInicial : 0;

      const entradas = movimentacoes
        .filter(m => m.produtoId === p.id && m.tipo === 'entrada')
        .reduce((acc, m) => acc + (m.quantidade ?? 0), 0);

      const saidas = movimentacoes
        .filter(m => m.produtoId === p.id && m.tipo === 'saida')
        .reduce((acc, m) => acc + (m.quantidade ?? 0), 0);

      const estoqueAtual = quantidadeInicial + entradas - saidas;

      return estoqueAtual <= quantidadeMinima;
    });
  }, [carregado, produtos, movimentacoes]);

  // ✅ Vendas da semana
  const vendasSemana = useMemo(() => {
    if (!carregado) return 0;
    const umaSemanaAtras = new Date();
    umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);

    return movimentacoes
      .filter(m => m.tipo === 'saida' && m.data.toDate() > umaSemanaAtras)
      .reduce((total, m) => total + (m.valorTotal ?? 0), 0);
  }, [carregado, movimentacoes]);

  // ✅ Últimas 10 movimentações
  const ultimasMov = useMemo(() => {
    if (!carregado) return [];
    return [...movimentacoes]
      .sort((a, b) => b.data.toDate() - a.data.toDate())
      .slice(0, 8)
      .map(m => {
        const produto = produtos.find(p => p.id === m.produtoId);
        return {
          tipo: m.tipo,
          nome: produto?.nome ?? 'Produto',
          quantidade: m.quantidade,
          data: new Date(m.data.toDate()).toLocaleDateString('pt-BR')
        };
      });
  }, [carregado, movimentacoes, produtos]);

  return (
    <div className="home-container">
      <h1 className="home-title">Bem-vindo ao Estoque Premium ⚡</h1>

      <div className="cards-container">
        <div className="card">
          <div className="card-icon">📦</div>
          <div className="card-content">
            <h3>Produtos em Estoque</h3>
            <p><strong>{produtos.length} produtos</strong></p>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">💲</div>
          <div className="card-content">
            <h3>Valor Total</h3>
            <p><strong>R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">⚠️</div>
          <div className="card-content">
            <h3>Produtos Críticos</h3>
            <p><strong>{produtosCriticos.length} itens</strong></p>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">🛒</div>
          <div className="card-content">
            <h3>Vendas da Semana</h3>
            <p><strong>R$ {vendasSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
          </div>
        </div>
      </div>

      <div className="card-table full-width">
        <h3>📅 Últimas Movimentações</h3>
        <table className="movimentacoes-tabela">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Produto</th>
              <th>Quantidade</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {ultimasMov.map((m, i) => (
              <tr key={i}>
                <td>{m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1)}</td>
                <td>{m.nome}</td>
                <td>{m.quantidade}</td>
                <td>{m.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
