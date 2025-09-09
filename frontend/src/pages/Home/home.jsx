// src/pages/Home/Home.jsx
import React, { useEffect, useState, useMemo } from 'react';
import './home.css';

// Chaves usadas no localStorage
const STORAGE = {
  produtos: 'produtos',
  movimentacoes: 'movimentacoes'
};

function loadList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

// Pega preço de venda do produto (fallback 0)
function getValorVenda(produtos, produtoId) {
  const p = produtos.find((x) => String(x.id) === String(produtoId));
  return Number(p?.valorVenda || 0);
}

// Converte data salva (ISO string ou Date) para Date
function toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  // se veio como {seconds} de outro mock, tente converter
  if (typeof d === 'object' && d.seconds) return new Date(d.seconds * 1000);
  return new Date(d); // ISO string
}

export default function Home() {
  const [produtos, setProdutos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    const produtosList = loadList(STORAGE.produtos);
    const movList = loadList(STORAGE.movimentacoes);
    setProdutos(produtosList);
    setMovimentacoes(movList);
    setCarregado(true);
  }, []);

  // (opcional) recarregar ao voltar o foco
  useEffect(() => {
    const handleFocus = () => {
      // Recarrega dos mocks
      setProdutos(loadList(STORAGE.produtos));
      setMovimentacoes(loadList(STORAGE.movimentacoes));
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Valor total do estoque (valorVenda * estoqueAtual)
  const valorTotal = useMemo(() => {
    if (!carregado) return 0;

    return produtos.reduce((total, p) => {
      const valorVenda = Number(p?.valorVenda || 0);
      const quantidadeInicial = parseInt(p?.quantidadeInicial, 10) || 0;

      const entradas = movimentacoes
        .filter((m) => String(m.produtoId) === String(p.id) && m.tipo === 'entrada')
        .reduce((acc, m) => acc + (parseInt(m.quantidade, 10) || 0), 0);

      const saidas = movimentacoes
        .filter((m) => String(m.produtoId) === String(p.id) && m.tipo === 'saida')
        .reduce((acc, m) => acc + (parseInt(m.quantidade, 10) || 0), 0);

      const estoqueAtual = quantidadeInicial + entradas - saidas;
      return total + valorVenda * estoqueAtual;
    }, 0);
  }, [carregado, produtos, movimentacoes]);

  // Produtos críticos (estoqueAtual <= quantidadeMinima)
  const produtosCriticos = useMemo(() => {
    if (!carregado) return [];

    return produtos.filter((p) => {
      const quantidadeMinima = parseInt(p?.quantidadeMinima, 10) || 0;
      const quantidadeInicial = parseInt(p?.quantidadeInicial, 10) || 0;

      const entradas = movimentacoes
        .filter((m) => String(m.produtoId) === String(p.id) && m.tipo === 'entrada')
        .reduce((acc, m) => acc + (parseInt(m.quantidade, 10) || 0), 0);

      const saidas = movimentacoes
        .filter((m) => String(m.produtoId) === String(p.id) && m.tipo === 'saida')
        .reduce((acc, m) => acc + (parseInt(m.quantidade, 10) || 0), 0);

      const estoqueAtual = quantidadeInicial + entradas - saidas;
      return estoqueAtual <= quantidadeMinima;
    });
  }, [carregado, produtos, movimentacoes]);

  // Vendas da semana (somatório de valorTotal ou fallback: valorVenda*quantidade)
  const vendasSemana = useMemo(() => {
    if (!carregado) return 0;
    const umaSemanaAtras = new Date();
    umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);

    return movimentacoes
      .filter((m) => m.tipo === 'saida' && toDate(m.data) && toDate(m.data) > umaSemanaAtras)
      .reduce((total, m) => {
        // Se a movimentação tem valorTotal, usa; senão calcula pelo produto
        const valorTotalMov = Number(m?.valorTotal);
        if (Number.isFinite(valorTotalMov) && valorTotalMov > 0) {
          return total + valorTotalMov;
        }
        const preco = getValorVenda(produtos, m.produtoId);
        const qtd = parseInt(m?.quantidade, 10) || 0;
        return total + preco * qtd;
      }, 0);
  }, [carregado, movimentacoes, produtos]);

  // Últimas movimentações (ordena por data desc; mostra 8)
  const ultimasMov = useMemo(() => {
    if (!carregado) return [];
    return [...movimentacoes]
      .filter((m) => toDate(m.data))
      .sort((a, b) => toDate(b.data) - toDate(a.data))
      .slice(0, 8)
      .map((m) => {
        const produto = produtos.find((p) => String(p.id) === String(m.produtoId));
        return {
          tipo: m.tipo,
          nome: produto?.nome ?? 'Produto',
          quantidade: parseInt(m.quantidade, 10) || 0,
          data: toDate(m.data)?.toLocaleDateString('pt-BR') ?? ''
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
            <p><strong>R$ {Number(valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
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
            <p><strong>R$ {Number(vendasSemana).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></p>
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
                <td>{m.tipo ? m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1) : ''}</td>
                <td>{m.nome}</td>
                <td>{m.quantidade}</td>
                <td>{m.data}</td>
              </tr>
            ))}
            {ultimasMov.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', opacity: 0.7 }}>
                  Sem movimentações recentes
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
