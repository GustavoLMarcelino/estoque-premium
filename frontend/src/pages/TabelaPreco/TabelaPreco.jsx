import React, { useCallback, useEffect, useState } from 'react';
import './TabelaPreco.css';
import { EstoqueAPI } from '../../services/estoque';

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
    let shouldFetch = false;
    setDataset((prev) => {
      const slice = prev[tipo];
      if (!slice) return prev;
      if (!slice.loaded && !slice.loading) {
        shouldFetch = true;
        return {
          ...prev,
          [tipo]: { ...slice, loading: true, error: '' },
        };
      }
      return prev;
    });

    if (!shouldFetch) return;

    try {
      const data = await EstoqueAPI.listar({ tipo });
      setDataset((prev) => ({
        ...prev,
        [tipo]: {
          items: (data ?? []).map(normalizeProduto),
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
  const isBaterias = activeTab === 'baterias';

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

        {isBaterias && (
          <div className="tabela-preco-note">
            Valor à vista aplica desconto automático de 10% sobre o valor cheio.
          </div>
        )}

        {current?.error && (
          <div className="tabela-preco-alert error">{current.error}</div>
        )}

        <div className="tabela-preco-table-wrap">
          <table className="tabela-preco-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Valor Cheio</th>
                {isBaterias && <th>Valor à Vista (-10%)</th>}
              </tr>
            </thead>
            <tbody>
              {current?.loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={isBaterias ? 3 : 2}
                    className="tabela-preco-empty"
                  >
                    Carregando preços...
                  </td>
                </tr>
              )}
              {!current?.loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={isBaterias ? 3 : 2}
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
                    {isBaterias && <td>{formatCurrency(valorVista)}</td>}
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
