import React, { useCallback, useEffect, useState } from 'react';
import './TabelaPreco.css';
import { EstoqueAPI } from '../../services/estoque';
import { EstoqueSomAPI } from '../../services/estoqueSom';

const tabs = [
  { key: 'baterias', label: 'Baterias' },
  { key: 'som', label: 'Som' },
];

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function normalizeProduto(row) {
  const valorVenda = Number(row?.valor_venda ?? row?.valorVenda ?? row?.preco ?? 0);
  return {
    id: row?.id ?? `${row?.produto ?? row?.nome ?? 'produto'}-${row?.modelo ?? ''}`,
    produto: row?.produto ?? row?.nome ?? '',
    modelo: row?.modelo ?? '',
    valorVenda: Number.isFinite(valorVenda) ? valorVenda : 0,
  };
}

function formatCurrency(value) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

export default function TabelaPreco() {
  const [activeTab, setActiveTab] = useState('baterias');
  const [dataset, setDataset] = useState({
    baterias: { items: [], loading: false, error: '', loaded: false },
    som: { items: [], loading: false, error: '', loaded: false },
  });

  const fetchData = useCallback(async (tipo) => {
    // sempre faz fetch na troca da aba, evitando ficar travado em "Carregando"
    setDataset((prev) => ({
      ...prev,
      [tipo]: { ...(prev[tipo] || {}), loading: true, error: '' },
    }));

    try {
      const api = tipo === 'som' ? EstoqueSomAPI : EstoqueAPI;
      const data = await api.listar({ tipo });
      const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setDataset((prev) => ({
        ...prev,
        [tipo]: {
          items: rows.map(normalizeProduto),
          loading: false,
          loaded: true,
          error: '',
        },
      }));
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Falha ao carregar preços';
      setDataset((prev) => ({
        ...prev,
        [tipo]: {
          ...prev[tipo],
          loading: false,
          loaded: false,
          error: message,
        },
      }));
    }
  }, []);

  useEffect(() => {
    fetchData('baterias');
  }, [fetchData]);

  const handleTabChange = (key) => {
    setActiveTab(key);
    fetchData(key);
  };

  const current = dataset[activeTab] || dataset.baterias;
  const rows = current?.items ?? [];

  return (
    <div className="tabela-preco-page">
      <div className="tabela-preco-card">
        <div className="tabela-preco-header">
          <div>
            <h2>Tabela de Preços</h2>
            <p className="tabela-preco-sub">
              Consulte rapidamente os valores praticados no estoque selecionado.
            </p>
          </div>
          <div className="tabela-preco-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => handleTabChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="tabela-preco-note">
          Valor à vista aplica desconto automático de 10% sobre o valor cheio.
        </div>

        {current?.error && (
          <div className="tabela-preco-alert error">{current.error}</div>
        )}

        <div className="tabela-preco-table-wrap">
          <table className="tabela-preco-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Valor Cheio</th>
                <th>Valor à Vista (-10%)</th>
              </tr>
            </thead>
            <tbody>
              {current?.loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="tabela-preco-empty"
                  >
                    Carregando preços...
                  </td>
                </tr>
              )}
              {!current?.loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="tabela-preco-empty"
                  >
                    Nenhum produto cadastrado para este estoque.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const nomeProduto = row.modelo
                  ? `${row.produto} - ${row.modelo}`
                  : row.produto;
                const valorVista = row.valorVenda * 0.9;
                return (
                  <tr key={row.id}>
                    <td>{nomeProduto}</td>
                    <td>{formatCurrency(row.valorVenda)}</td>
                    <td>{formatCurrency(valorVista)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
