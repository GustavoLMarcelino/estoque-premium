import React, { useCallback, useEffect, useState } from 'react';
import { Tag, PackageOpen } from 'lucide-react';
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
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
              <Tag size={24} strokeWidth={2.2} />
            </span>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800">Tabela de Preços</h1>
              <p className="text-sm text-slate-500">
                Consulte rapidamente os valores praticados no estoque selecionado.
              </p>
            </div>
          </div>

          {/* Toggle Baterias / Som */}
          <div className="flex gap-2">
            {tabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabChange(tab.key)}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-amber-400 text-slate-900 shadow-sm'
                      : 'border border-amber-300 bg-white text-amber-600 hover:bg-amber-50'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {current?.error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {current.error}
          </div>
        )}

        {/* Tabela */}
        <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-800 text-left text-xs font-semibold uppercase tracking-wide text-white">
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Valor Cheio</th>
                </tr>
              </thead>
              <tbody>
                {current?.loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-12 text-center text-sm text-slate-400">
                      Carregando preços...
                    </td>
                  </tr>
                )}

                {!current?.loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-16">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <PackageOpen size={44} strokeWidth={1.4} className="text-slate-300" />
                        <p className="text-sm font-medium text-slate-500">
                          Nenhum produto cadastrado para este estoque.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {rows.map((row) => {
                  const nomeProduto = row.modelo
                    ? `${row.produto} - ${row.modelo}`
                    : row.produto;
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60 transition-colors hover:bg-amber-50/50"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-800">{nomeProduto}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600">{formatCurrency(row.valorVenda)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
