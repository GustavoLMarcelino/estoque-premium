// src/pages/stockmind/RecomendacoesReposicao.jsx
import React, { useMemo, useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { PRODUTOS_MOCK } from './mockData';
import { Card, PrioridadeBadge } from './ui';

const HORIZONTES = [
  { value: 30, label: '30 dias' },
  { value: 60, label: '60 dias' },
  { value: 90, label: '90 dias' },
];

const CRITICIDADES = [
  { value: 'todos', label: 'Todos' },
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Média' },
  { value: 'baixa', label: 'Baixa' },
];

export default function RecomendacoesReposicao() {
  // Horizonte é só visual por enquanto — recalcularia via API quando existir.
  // Criticidade já filtra a lista mockada no cliente.
  const [horizonte, setHorizonte] = useState(30);
  const [criticidade, setCriticidade] = useState('todos');
  const [expandido, setExpandido] = useState(null);

  const produtos = useMemo(
    () => (criticidade === 'todos' ? PRODUTOS_MOCK : PRODUTOS_MOCK.filter((p) => p.prioridade === criticidade)),
    [criticidade],
  );

  function toggleExpandido(id) {
    setExpandido((atual) => (atual === id ? null : id));
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      {/* Header */}
      <div className="rounded-2xl bg-slate-900 px-6 py-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="h-8 w-1.5 rounded-full bg-amber-400" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-white md:text-2xl">Recomendações de Reposição</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                <Sparkles size={12} /> StockMind
              </span>
            </div>
            <p className="text-sm text-slate-300">Sugestões de compra com base na previsão de demanda</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:max-w-md sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Horizonte</span>
          <select
            value={horizonte}
            onChange={(e) => setHorizonte(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          >
            {HORIZONTES.map((h) => (
              <option key={h.value} value={h.value}>{h.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Criticidade</span>
          <select
            value={criticidade}
            onChange={(e) => setCriticidade(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          >
            {CRITICIDADES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Tabela */}
      <Card title={`Sugestões de compra (${produtos.length})`} className="mt-4">
        {produtos.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum produto nessa criticidade.</p>
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-slate-400">
                    <th className="pb-2 pr-3 font-semibold">Produto</th>
                    <th className="pb-2 pr-3 font-semibold">Estoque</th>
                    <th className="pb-2 pr-3 font-semibold">Demanda prevista</th>
                    <th className="pb-2 pr-3 font-semibold">Qtd sugerida</th>
                    <th className="pb-2 pr-3 font-semibold">Prioridade</th>
                    <th className="pb-2 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {produtos.map((p) => {
                    const aberto = expandido === p.id;
                    return (
                      <React.Fragment key={p.id}>
                        <tr>
                          <td className="py-2.5 pr-3 font-medium text-slate-700">{p.produto}</td>
                          <td className="py-2.5 pr-3 text-slate-600">{p.estoqueAtual}</td>
                          <td className="py-2.5 pr-3 text-slate-600">{p.demandaPrevista30d}</td>
                          <td className="py-2.5 pr-3 text-slate-600">{p.quantidadeSugerida ?? '—'}</td>
                          <td className="py-2.5 pr-3"><PrioridadeBadge prioridade={p.prioridade} /></td>
                          <td className="py-2.5 text-right">
                            {p.justificativa && (
                              <button
                                type="button"
                                onClick={() => toggleExpandido(p.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700"
                              >
                                Ver justificativa {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            )}
                          </td>
                        </tr>
                        {aberto && p.justificativa && (
                          <tr>
                            <td colSpan={6} className="bg-amber-50/60 px-3 py-3 text-sm text-slate-600">
                              {p.justificativa}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards empilhados */}
            <ul className="space-y-3 md:hidden">
              {produtos.map((p) => {
                const aberto = expandido === p.id;
                return (
                  <li key={p.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">{p.produto}</span>
                      <PrioridadeBadge prioridade={p.prioridade} />
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-slate-500">
                      <dt>Estoque</dt>
                      <dd className="text-right text-slate-700">{p.estoqueAtual}</dd>
                      <dt>Demanda prevista</dt>
                      <dd className="text-right text-slate-700">{p.demandaPrevista30d}</dd>
                      <dt>Qtd sugerida</dt>
                      <dd className="text-right text-slate-700">{p.quantidadeSugerida ?? '—'}</dd>
                    </dl>
                    {p.justificativa && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleExpandido(p.id)}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-600"
                        >
                          Ver justificativa {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {aberto && (
                          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-slate-600">{p.justificativa}</p>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-400">
        * Dados de demonstração (mock). O filtro de horizonte ainda não recalcula nada — a quantidade sugerida e a
        justificativa vêm fixas do mock até existir uma fonte real de previsão.
      </p>
    </div>
  );
}
