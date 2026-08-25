// src/pages/stockmind/DashboardInteligente.jsx
import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Sparkles, AlertTriangle, TrendingUp, Boxes } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PRODUTOS_MOCK, DEMANDA_POR_CATEGORIA } from './mockData';
import { KpiCard, Card, PrioridadeBadge } from './ui';

const ORDEM_PRIORIDADE = { alta: 0, media: 1, baixa: 2 };

export default function DashboardInteligente() {
  const produtosMonitorados = PRODUTOS_MOCK.length;
  const emRisco = useMemo(
    () => PRODUTOS_MOCK.filter((p) => p.estoqueAtual < p.estoqueMinimo),
    [],
  );
  const altoGiro = PRODUTOS_MOCK.filter((p) => p.giro === 'alto').length;

  const maioresRiscos = useMemo(
    () =>
      [...emRisco]
        .sort((a, b) => ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade])
        .slice(0, 6),
    [emRisco],
  );

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      {/* Header */}
      <div className="rounded-2xl bg-slate-900 px-6 py-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="h-8 w-1.5 rounded-full bg-amber-400" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-white md:text-2xl">Dashboard Inteligente</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                <Sparkles size={12} /> StockMind
              </span>
            </div>
            <p className="text-sm text-slate-300">Previsão de demanda e risco de ruptura — dados de demonstração</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Produtos Monitorados"
          value={produtosMonitorados}
          icon={Boxes}
          ring="bg-sky-50 text-sky-600"
        />
        <KpiCard
          label="Risco de Ruptura"
          value={emRisco.length}
          icon={AlertTriangle}
          ring="bg-rose-50 text-rose-600"
          accent="text-rose-600"
        />
        <KpiCard
          label="Alto Giro"
          value={altoGiro}
          icon={TrendingUp}
          ring="bg-emerald-50 text-emerald-600"
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Tabela de risco */}
        <Card title="Produtos com maior risco" className="lg:col-span-3">
          {maioresRiscos.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum produto com estoque abaixo do mínimo no momento.</p>
          ) : (
            <>
              {/* Desktop: tabela */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-slate-400">
                      <th className="pb-2 pr-3 font-semibold">Produto</th>
                      <th className="pb-2 pr-3 font-semibold">Estoque</th>
                      <th className="pb-2 pr-3 font-semibold">Demanda (30d)</th>
                      <th className="pb-2 font-semibold">Recomendação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {maioresRiscos.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 pr-3 font-medium text-slate-700">{p.produto}</td>
                        <td className="py-2.5 pr-3 text-slate-600">
                          {p.estoqueAtual} <span className="text-slate-400">/ mín {p.estoqueMinimo}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600">{p.demandaPrevista30d}</td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <PrioridadeBadge prioridade={p.prioridade} />
                            <span className="text-slate-500">Comprar {p.quantidadeSugerida} un</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: cards empilhados */}
              <ul className="space-y-3 md:hidden">
                {maioresRiscos.map((p) => (
                  <li key={p.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">{p.produto}</span>
                      <PrioridadeBadge prioridade={p.prioridade} />
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-slate-500">
                      <dt>Estoque</dt>
                      <dd className="text-right text-slate-700">{p.estoqueAtual} / mín {p.estoqueMinimo}</dd>
                      <dt>Demanda 30d</dt>
                      <dd className="text-right text-slate-700">{p.demandaPrevista30d}</dd>
                      <dt>Sugestão</dt>
                      <dd className="text-right text-slate-700">Comprar {p.quantidadeSugerida} un</dd>
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-4 text-right">
            <Link to="/stockmind/recomendacoes" className="text-sm font-semibold text-amber-600 hover:text-amber-700">
              Ver todas as recomendações →
            </Link>
          </div>
        </Card>

        {/* Gráfico de demanda por categoria */}
        <Card title="Previsão de demanda por categoria — próximos 30 dias" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DEMANDA_POR_CATEGORIA} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="categoria" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="demanda" radius={[8, 8, 0, 0]} maxBarSize={56} fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        * Dados de demonstração (mock) — este módulo ainda não está conectado a nenhuma fonte real de estoque ou vendas.
      </p>
    </div>
  );
}
