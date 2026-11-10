// src/pages/stockmind/DashboardInteligente.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Sparkles, AlertTriangle, TrendingUp, Boxes } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StockMindAPI, mensagemErroPrevisao } from '../../services/stockmind';
import { KpiCard, Card, PrioridadeBadge } from './ui';
import { formatarDemanda } from './formatar';
import EstoqueParado from './EstoqueParado';

export default function DashboardInteligente() {
  const [previsao, setPrevisao] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    StockMindAPI.getPrevisao()
      .then((data) => setPrevisao(data))
      .catch((e) => setErro(mensagemErroPrevisao(e)));
  }, []);

  const grupos = useMemo(() => previsao?.grupos ?? [], [previsao]);
  const demandaPorCategoria = previsao?.demandaPorCategoria ?? [];
  const parametros = previsao?.parametros;

  const produtosMonitorados = useMemo(() => grupos.reduce((soma, g) => soma + g.skus.length, 0), [grupos]);
  const emRisco = useMemo(() => grupos.filter((g) => g.prioridade === 'alta'), [grupos]);
  const altoGiro = grupos.filter((g) => g.giro === 'alto').length;

  // O backend já entrega os grupos ordenados por prioridade e quantidade.
  const maioresRiscos = useMemo(() => grupos.filter((g) => g.prioridade !== 'baixa').slice(0, 6), [grupos]);

  if (erro) {
    return (
      <div className="min-h-screen bg-slate-100 p-4 md:p-6">
        <div className="rounded-2xl bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">{erro}</div>
      </div>
    );
  }

  if (!previsao) {
    return (
      <div className="min-h-screen bg-slate-100 p-4 md:p-6">
        <div className="rounded-2xl bg-white p-6 text-sm text-slate-400 ring-1 ring-slate-200">Carregando previsão…</div>
      </div>
    );
  }

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
            <p className="text-sm text-slate-300">Previsão de demanda e risco de ruptura por grupo de bateria</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Grupos Monitorados"
          value={grupos.length}
          hint={`${produtosMonitorados} produtos em ${grupos.length} grupos`}
          icon={Boxes}
          ring="bg-sky-50 text-sky-600"
        />
        <KpiCard
          label="Risco de Ruptura"
          value={emRisco.length}
          hint={`grupos com cobertura < ${parametros.coberturaAltaDias} dias`}
          icon={AlertTriangle}
          ring="bg-rose-50 text-rose-600"
          accent="text-rose-600"
        />
        <KpiCard
          label="Alto Giro"
          value={altoGiro}
          hint="grupos no terço de maior demanda"
          icon={TrendingUp}
          ring="bg-emerald-50 text-emerald-600"
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Tabela de risco */}
        <Card title="Grupos com maior risco" className="lg:col-span-3">
          {maioresRiscos.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum grupo com cobertura abaixo de {parametros.coberturaMediaDias} dias no momento.</p>
          ) : (
            <>
              {/* Desktop: tabela */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-slate-400">
                      <th className="pb-2 pr-3 font-semibold">Grupo</th>
                      <th className="pb-2 pr-3 font-semibold">Estoque</th>
                      <th className="pb-2 pr-3 font-semibold">Demanda (30d)</th>
                      <th className="pb-2 font-semibold">Recomendação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {maioresRiscos.map((g) => (
                      <tr key={g.id}>
                        <td className="py-2.5 pr-3 font-medium text-slate-700">{g.grupo}</td>
                        <td className="py-2.5 pr-3 text-slate-600">
                          {g.estoqueAtual} <span className="text-slate-400">/ mín {g.estoqueSeguranca}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600">{formatarDemanda(g.demandaPrevista30d)}</td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <PrioridadeBadge prioridade={g.prioridade} />
                            <span className="text-slate-500">{g.acao}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: cards empilhados */}
              <ul className="space-y-3 md:hidden">
                {maioresRiscos.map((g) => (
                  <li key={g.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">{g.grupo}</span>
                      <PrioridadeBadge prioridade={g.prioridade} />
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-slate-500">
                      <dt>Estoque</dt>
                      <dd className="text-right text-slate-700">{g.estoqueAtual} / mín {g.estoqueSeguranca}</dd>
                      <dt>Demanda 30d</dt>
                      <dd className="text-right text-slate-700">{formatarDemanda(g.demandaPrevista30d)}</dd>
                      <dt>Sugestão</dt>
                      <dd className="text-right text-slate-700">{g.acao}</dd>
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
        <Card title="Previsão de demanda por categoria — próximos 30 dias (soma dos grupos)" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={demandaPorCategoria} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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

      <EstoqueParado />

      <p className="mt-4 text-xs text-slate-400">
        * Previsão calculada a partir do histórico real de vendas. Atualizada em: {new Date(previsao.gerado_em).toLocaleString('pt-BR')}
      </p>
    </div>
  );
}
