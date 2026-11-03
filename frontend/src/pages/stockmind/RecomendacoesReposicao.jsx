// src/pages/stockmind/RecomendacoesReposicao.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { StockMindAPI, mensagemErroPrevisao } from '../../services/stockmind';
import { Card, PrioridadeBadge } from './ui';
import { formatarDemanda } from './formatar';

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

function formatarParticipacao(p) {
  return p == null ? '—' : `${Math.round(p * 100)}%`;
}

// Detalhe do grupo: justificativa + SKUs com estoque e participação nas vendas.
// A distribuição por marca é só sugestão — a decisão de marca é do gestor.
function DetalheGrupo({ grupo }) {
  const temDistribuicao = grupo.skus.some((s) => s.distribuicaoSugerida > 0);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{grupo.justificativa}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="uppercase text-slate-400">
              <th className="pb-1.5 pr-3 font-semibold">Produto</th>
              <th className="pb-1.5 pr-3 font-semibold">Marca</th>
              <th className="pb-1.5 pr-3 font-semibold">Estoque</th>
              <th className="pb-1.5 pr-3 font-semibold">Vendas 6m</th>
              <th className="pb-1.5 pr-3 font-semibold">Participação</th>
              {temDistribuicao && <th className="pb-1.5 font-semibold">Sugestão</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {grupo.skus.map((s) => (
              <tr key={s.id}>
                <td className="py-1.5 pr-3 font-medium text-slate-700">{s.produto}</td>
                <td className="py-1.5 pr-3 text-slate-600">{s.marca}</td>
                <td className="py-1.5 pr-3 text-slate-600">
                  {s.estoqueAtual} <span className="text-slate-400">/ mín {s.estoqueMinimo}</span>
                </td>
                <td className="py-1.5 pr-3 text-slate-600">{s.vendas6m}</td>
                <td className="py-1.5 pr-3 text-slate-600">{formatarParticipacao(s.participacao)}</td>
                {temDistribuicao && <td className="py-1.5 text-slate-600">{s.distribuicaoSugerida || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {temDistribuicao && (
        <p className="text-xs text-slate-400">
          Sugestão = quantidade do grupo repartida pela participação de cada produto nas vendas dos últimos 6 meses.
          A decisão final de marca é sua.
        </p>
      )}
    </div>
  );
}

export default function RecomendacoesReposicao() {
  // Horizonte é só visual por enquanto (a previsão pré-calculada é de 30d) —
  // recalcularia via API se/quando existir previsão por horizonte.
  // Criticidade filtra a lista vinda da API no cliente.
  const [horizonte, setHorizonte] = useState(30);
  const [criticidade, setCriticidade] = useState('todos');
  const [expandido, setExpandido] = useState(null);
  const [previsao, setPrevisao] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    StockMindAPI.getPrevisao()
      .then((data) => setPrevisao(data))
      .catch((e) => setErro(mensagemErroPrevisao(e)));
  }, []);

  const todosGrupos = useMemo(() => previsao?.grupos ?? [], [previsao]);

  const grupos = useMemo(
    () => (criticidade === 'todos' ? todosGrupos : todosGrupos.filter((g) => g.prioridade === criticidade)),
    [criticidade, todosGrupos],
  );

  function toggleExpandido(id) {
    setExpandido((atual) => (atual === id ? null : id));
  }

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
              <h1 className="text-xl font-bold text-white md:text-2xl">Recomendações de Reposição</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                <Sparkles size={12} /> StockMind
              </span>
            </div>
            <p className="text-sm text-slate-300">Sugestões de compra por grupo de bateria, com base na previsão de demanda</p>
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
      <Card title={`Sugestões de compra por grupo (${grupos.length})`} className="mt-4">
        {grupos.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum grupo nessa criticidade.</p>
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-slate-400">
                    <th className="pb-2 pr-3 font-semibold">Grupo</th>
                    <th className="pb-2 pr-3 font-semibold">Estoque do grupo</th>
                    <th className="pb-2 pr-3 font-semibold">Demanda prevista</th>
                    <th className="pb-2 pr-3 font-semibold">Sugestão</th>
                    <th className="pb-2 pr-3 font-semibold">Prioridade</th>
                    <th className="pb-2 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {grupos.map((g) => {
                    const aberto = expandido === g.id;
                    return (
                      <React.Fragment key={g.id}>
                        <tr>
                          <td className="py-2.5 pr-3 font-medium text-slate-700">
                            {g.grupo}
                            <span className="block text-xs font-normal text-slate-400">{g.skus.length} produto(s)</span>
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {g.estoqueAtual} <span className="text-slate-400">/ mín {g.estoqueSeguranca}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">{formatarDemanda(g.demandaPrevista30d)}</td>
                          <td className="py-2.5 pr-3 text-slate-600">{g.acao}</td>
                          <td className="py-2.5 pr-3"><PrioridadeBadge prioridade={g.prioridade} /></td>
                          <td className="py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => toggleExpandido(g.id)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700"
                            >
                              Ver produtos {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          </td>
                        </tr>
                        {aberto && (
                          <tr>
                            <td colSpan={6} className="bg-amber-50/60 px-3 py-3">
                              <DetalheGrupo grupo={g} />
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
              {grupos.map((g) => {
                const aberto = expandido === g.id;
                return (
                  <li key={g.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">{g.grupo}</span>
                      <PrioridadeBadge prioridade={g.prioridade} />
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-slate-500">
                      <dt>Estoque do grupo</dt>
                      <dd className="text-right text-slate-700">{g.estoqueAtual} / mín {g.estoqueSeguranca}</dd>
                      <dt>Demanda prevista</dt>
                      <dd className="text-right text-slate-700">{formatarDemanda(g.demandaPrevista30d)}</dd>
                      <dt>Sugestão</dt>
                      <dd className="text-right text-slate-700">{g.acao}</dd>
                    </dl>
                    <button
                      type="button"
                      onClick={() => toggleExpandido(g.id)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-600"
                    >
                      Ver produtos {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {aberto && (
                      <div className="mt-2 rounded-lg bg-amber-50 p-2">
                        <DetalheGrupo grupo={g} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-400">
        * Previsão calculada a partir do histórico real de vendas — janela de 30 dias. A necessidade do grupo é
        demanda + estoque de segurança (soma dos mínimos); prioridade pela cobertura: Alta abaixo de{' '}
        {previsao.parametros.coberturaAltaDias} dias, Média até {previsao.parametros.coberturaMediaDias} dias. O filtro
        de horizonte ainda não recalcula nada (60/90 dias exigiriam um modelo por horizonte). Atualizada em:{' '}
        {new Date(previsao.gerado_em).toLocaleString('pt-BR')}
      </p>
    </div>
  );
}
