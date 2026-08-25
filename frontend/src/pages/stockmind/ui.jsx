// src/pages/stockmind/ui.jsx
// Pequenos blocos de UI compartilhados só entre as telas do StockMind —
// mesmo padrão visual do resto do sistema (cards brancos, ring slate,
// acento âmbar), reimplementado localmente para o módulo ficar
// autocontido (cotoco de futuro repo próprio).
import React from 'react';

// Icon é JSX (<Icon .../>): a config atual do projeto (sem eslint-plugin-react)
// não reconhece o destructure renomeado de parâmetro como "usado" — mesmo
// falso-positivo já presente em Dashboards.jsx (KpiCard) e em outras telas.
// eslint-disable-next-line no-unused-vars
export function KpiCard({ label, value, icon: Icon, ring, accent, hint }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${ring}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className={`mt-3 text-2xl font-bold ${accent || 'text-slate-800'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function Card({ title, children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>
      {title && <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>}
      {children}
    </div>
  );
}

const PRIORIDADE_STYLES = {
  alta: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  media: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  baixa: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
};
const PRIORIDADE_LABELS = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export function PrioridadeBadge({ prioridade }) {
  const cls = PRIORIDADE_STYLES[prioridade] || PRIORIDADE_STYLES.baixa;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {PRIORIDADE_LABELS[prioridade] || prioridade}
    </span>
  );
}
