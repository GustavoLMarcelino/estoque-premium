import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import './home.css';

// ===== estilos visuais (iguais ao molde claro usado no Estoque) =====
const tableWrap = {
  overflowX: 'auto',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  background: '#fff',
  boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
};
const table = { width: '100%', borderCollapse: 'collapse' };
const thBase = {
  padding: 12,
  textAlign: 'left',
  borderBottom: '1px solid #e5e7eb',
  background: '#f3f4f6',
  color: '#111827',
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: 'nowrap',
};
const td = { borderBottom: '1px solid #e5e7eb', padding: 10, whiteSpace: 'nowrap' };

// Badge de tipo (Entrada/Saída) no resumo
const tipoChip = (tipo) => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  background: tipo === 'entrada' ? '#ecfdf5' : '#fef2f2',
  color: tipo === 'entrada' ? '#065f46' : '#991b1b',
});

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatCurrency = (v) => currencyFormatter.format(Number.isFinite(v) ? v : 0);

const normalizeProduto = (row, source) => {
  const valorVenda = Number(row?.valor_venda ?? row?.valorVenda ?? 0);
  const entradas = Number(row?.entradas ?? 0);
  const saidas = Number(row?.saidas ?? 0);
  const qtdInicial = Number(row?.qtd_inicial ?? 0);
  const emEstoque = Number(row?.em_estoque ?? (qtdInicial + entradas - saidas));
  const qtdMinima = Number(row?.qtd_minima ?? 0);
  const nomeBase = row?.produto ?? row?.nome ?? '';
  const nome = row?.modelo ? `${nomeBase} - ${row.modelo}` : nomeBase;
  return {
    id: row?.id,
    source,
    nome,
    valorVenda: Number.isFinite(valorVenda) ? valorVenda : 0,
    emEstoque: Number.isFinite(emEstoque) ? emEstoque : 0,
    qtdMinima: Number.isFinite(qtdMinima) ? qtdMinima : 0,
  };
};

const normalizeMov = (mov, source, nomeMap, precoMap) => {
  const tipo = String(mov?.tipo || '').toLowerCase();
  const quantidade = Number(mov?.quantidade ?? 0);
  const valorFinal = Number(mov?.valor_final ?? mov?.valorFinal ?? 0);
  const dataStr = mov?.data_movimentacao || mov?.data || mov?.created_at;
  const data = dataStr ? new Date(dataStr) : null;
  const key = `${source}-${mov?.produto_id}`;
  const nome = nomeMap.get(key) || 'Produto';
  const preco = precoMap.get(key) || 0;
  const valorSaida = tipo === 'saida' ? (valorFinal > 0 ? valorFinal : preco * quantidade) : 0;
  return {
    tipo: tipo === 'entrada' ? 'entrada' : 'saida',
    nome,
    quantidade,
    data,
    valorSaida,
    sortKey: data ? data.getTime() : 0,
  };
};

export default function Home() {
  const [cards, setCards] = useState({ produtos: 0, valorTotal: 0, criticos: 0, vendasSemana: 0 });
  const [ultimasMov, setUltimasMov] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancel = false;
    async function loadDashboard() {
      setLoading(true);
      setErrorMsg('');
      try {
        const [estResp, somResp, movResp, movSomResp] = await Promise.all([
          api.get('/estoque', { params: { pageSize: 500 } }),
          api.get('/estoque-som', { params: { pageSize: 500 } }),
          api.get('/movimentacoes', { params: { pageSize: 20 } }),
          api.get('/movimentacoes-som', { params: { pageSize: 20 } }),
        ]);

        const bateriasPayload = estResp?.data || {};
        const somPayload = somResp?.data || {};

        const baterias = Array.isArray(bateriasPayload) ? bateriasPayload : bateriasPayload.data || [];
        const som = Array.isArray(somPayload) ? somPayload : somPayload.data || [];

        const bateriasTotal = bateriasPayload?.total ?? baterias.length;
        const somTotal = somPayload?.total ?? som.length;

        const bateriasNorm = baterias.map((r) => normalizeProduto(r, 'b'));
        const somNorm = som.map((r) => normalizeProduto(r, 's'));
        const inventario = [...bateriasNorm, ...somNorm];

        const nomeMap = new Map(inventario.map((p) => [`${p.source}-${p.id}`, p.nome]));
        const precoMap = new Map(inventario.map((p) => [`${p.source}-${p.id}`, p.valorVenda]));

        const totalProdutos = Number(bateriasTotal) + Number(somTotal);
        const valorTotal = inventario.reduce((acc, p) => acc + p.valorVenda * p.emEstoque, 0);
        const criticos = inventario.filter((p) => p.emEstoque <= p.qtdMinima).length;

        const movsB = Array.isArray(movResp?.data?.data) ? movResp.data.data : [];
        const movsS = Array.isArray(movSomResp?.data?.data) ? movSomResp.data.data : [];

        const movNorm = [
          ...movsB.map((m) => normalizeMov(m, 'b', nomeMap, precoMap)),
          ...movsS.map((m) => normalizeMov(m, 's', nomeMap, precoMap)),
        ]
          .filter((m) => m.data)
          .sort((a, b) => b.sortKey - a.sortKey);

        const ultimas = movNorm.slice(0, 8).map((m) => ({
          ...m,
          dataFmt: m.data ? m.data.toLocaleDateString('pt-BR') : '',
        }));

        const umaSemanaAtras = new Date();
        umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);
        const vendasSemana = movNorm
          .filter((m) => m.tipo === 'saida' && m.data && m.data >= umaSemanaAtras)
          .reduce((acc, m) => acc + m.valorSaida, 0);

        if (cancel) return;
        setCards({
          produtos: totalProdutos,
          valorTotal,
          criticos,
          vendasSemana,
        });
        setUltimasMov(ultimas);
      } catch (e) {
        if (cancel) return;
        console.error('Dashboard Home erro:', e);
        setErrorMsg(e?.response?.data?.message || e?.message || 'Falha ao carregar dashboard');
      } finally {
        if (!cancel) setLoading(false);
      }
    }

    loadDashboard();
    return () => { cancel = true; };
  }, []);

  const cardsContent = useMemo(() => ([
    {
      label: 'Produtos em Estoque',
      value: `${cards.produtos} produtos`,
      icon: '📦',
    },
    {
      label: 'Valor Total',
      value: formatCurrency(cards.valorTotal),
      icon: '💲',
    },
    {
      label: 'Produtos Críticos',
      value: `${cards.criticos} itens`,
      icon: '⚠️',
    },
    {
      label: 'Vendas da Semana',
      value: formatCurrency(cards.vendasSemana),
      icon: '🛒',
    },
  ]), [cards]);

  return (
    <div className="home-container">
      <h1 className="home-title">Bem-vindo ao Estoque Premium ⚡</h1>

      <div className="cards-container">
        {cardsContent.map((c) => (
          <div className="card" key={c.label}>
            <div className="card-icon">{c.icon}</div>
            <div className="card-content">
              <h3>{c.label}</h3>
              <p><strong>{c.value}</strong></p>
            </div>
          </div>
        ))}
      </div>

      <div className="card-table full-width" style={{ borderRadius: 12, padding: 0, background: 'transparent', boxShadow: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 10px 4px' }}>
          <h3 style={{ margin: 0 }}>📅 Últimas Movimentações</h3>
          {loading && <span style={{ color: '#6b7280', fontSize: 14 }}>Carregando...</span>}
        </div>

        {errorMsg && (
          <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
            {errorMsg}
          </div>
        )}

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={thBase}>Tipo</th>
                <th style={thBase}>Produto</th>
                <th style={thBase}>Quantidade</th>
                <th style={thBase}>Data</th>
              </tr>
            </thead>
            <tbody>
              {ultimasMov.map((m, i) => (
                <tr key={`${m.nome}-${m.sortKey}-${i}`} style={{ background: '#fff' }}>
                  <td style={td}>
                    <span style={tipoChip(m.tipo)}>
                      {m.tipo ? m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1) : ''}
                    </span>
                  </td>
                  <td style={td}>{m.nome}</td>
                  <td style={td}>{m.quantidade}</td>
                  <td style={td}>{m.dataFmt}</td>
                </tr>
              ))}
              {!loading && ultimasMov.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ ...td, textAlign: 'center', fontStyle: 'italic', color: '#6b7280' }}>
                    Sem movimentações recentes
                  </td>
                </tr>
              )}
              {loading && ultimasMov.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ ...td, textAlign: 'center', fontStyle: 'italic', color: '#6b7280' }}>
                    Carregando dados...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
