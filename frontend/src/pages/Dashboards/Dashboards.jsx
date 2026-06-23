// src/pages/Dashboards/Dashboards.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  PieChart, Pie,
  LineChart, Line,
} from 'recharts';
import { Wallet, TrendingUp, DollarSign, Package } from 'lucide-react';
import { MovAPI } from '../../services/movimentacoes';
import { EstoqueAPI } from '../../services/estoque';

const FEES_KEY = 'feesConfig'; // { debitoPct, creditoAVistaPct, creditoParceladoPct }

function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRL = (v) => brl.format(Number(v || 0));

// Paleta (alinhada à marca: slate + âmbar, com verde p/ lucro e rosa p/ custo)
const COLORS = {
  receita: '#0ea5e9',  // sky
  lucro: '#10b981',    // emerald
  custo: '#f43f5e',    // rose
  taxas: '#f59e0b',    // amber
  amber: '#f59e0b',
};

export default function Dashboards() {
  const [movs, setMovs] = useState([]);
  const [prods, setProds] = useState([]);
  const [fees, setFees] = useState(()=> loadJson(FEES_KEY, { debitoPct: 1.89, creditoAVistaPct: 4.49, creditoParceladoPct: 1.99 }));
  const [saved, setSaved] = useState(false);

  useEffect(()=>{
    (async ()=>{
      try {
        const [m, p] = await Promise.all([
          MovAPI.listar({ page: 1, pageSize: 1000 }),
          EstoqueAPI.listar({ q: '' })
        ]);
        setMovs(Array.isArray(m) ? m : []);
        setProds(Array.isArray(p) ? p : []);
      } catch (e) {
        console.error('Dash fetch error', e);
      }
    })();
  }, []);

  // maps
  const prodMap = useMemo(()=> {
    const map = new Map();
    for (const x of prods || []) map.set(Number(x.id), x);
    return map;
  }, [prods]);

  const pagamentos = useMemo(()=> loadJson('movPagamentos', {}), []);

  // taxa de uma movimentação de saída (mesma regra usada no resumo)
  function calcTaxa(mv, receita) {
    const meta = pagamentos[String(mv.id)] || {};
    const f = fees || {};
    if (meta.forma === 'debito') return receita * (Number(f.debitoPct || 0) / 100);
    if (meta.forma === 'credito') {
      return Number(meta.parcelas || 1) > 1
        ? receita * (Number(f.creditoParceladoPct || 0) / 100) * Number(meta.parcelas || 1)
        : receita * (Number(f.creditoAVistaPct || 0) / 100);
    }
    return 0; // dinheiro/pix
  }

  const resumo = useMemo(()=> {
    let vendasBrutas = 0, custoVendido = 0, taxas = 0;
    let qtdVendas = 0;

    for (const mv of movs || []) {
      const tipo = String(mv.tipo || '').toLowerCase();
      if (tipo !== 'saida') continue;

      const prod = prodMap.get(Number(mv.produto_id));
      const qtd = Number(mv.quantidade || 0);
      const custo = qtd * Number(prod?.custo || 0);
      const receita = Number(mv.valor_final || 0) * qtd; // valor_final é unitário no seu fluxo
      vendasBrutas += receita;
      custoVendido += custo;
      qtdVendas += qtd;
      taxas += calcTaxa(mv, receita);
    }

    const lucroBruto = vendasBrutas - custoVendido;
    const lucroLiquido = lucroBruto - taxas;
    return { vendasBrutas, custoVendido, taxas, lucroBruto, lucroLiquido, qtdVendas };
  }, [movs, prodMap, pagamentos, fees]);

  // Série temporal de receita (somente vendas com data) — leitura derivada, não altera o fluxo.
  const serie = useMemo(()=> {
    const byDay = new Map();
    for (const mv of movs || []) {
      if (String(mv.tipo || '').toLowerCase() !== 'saida') continue;
      if (!mv.data_movimentacao) continue;
      const d = new Date(mv.data_movimentacao);
      if (Number.isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const qtd = Number(mv.quantidade || 0);
      const receita = Number(mv.valor_final || 0) * qtd;
      byDay.set(key, (byDay.get(key) || 0) + receita);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, receita]) => ({
        label: key.slice(8, 10) + '/' + key.slice(5, 7), // dd/MM
        receita,
      }));
  }, [movs]);

  const barData = [
    { name: 'Receita Bruta', value: resumo.vendasBrutas, fill: COLORS.receita },
    { name: 'Lucro Líquido', value: resumo.lucroLiquido, fill: COLORS.lucro },
  ];

  const pieData = [
    { name: 'Custo dos vendidos', value: Math.max(0, resumo.custoVendido), color: COLORS.custo },
    { name: 'Taxas de máquina', value: Math.max(0, resumo.taxas), color: COLORS.taxas },
    { name: 'Lucro líquido', value: Math.max(0, resumo.lucroLiquido), color: COLORS.lucro },
  ];

  const hasVendas = resumo.qtdVendas > 0;

  function saveFees() {
    localStorage.setItem(FEES_KEY, JSON.stringify(fees));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      {/* Header */}
      <div className="rounded-2xl bg-slate-900 px-6 py-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="h-8 w-1.5 rounded-full bg-amber-400" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">Dashboards</h1>
            <p className="text-sm text-slate-300">Visão geral de vendas, lucro e taxas</p>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Receita Bruta" value={fmtBRL(resumo.vendasBrutas)} icon={Wallet}
          ring="bg-sky-50 text-sky-600" />
        <KpiCard label="Lucro Bruto" value={fmtBRL(resumo.lucroBruto)} icon={TrendingUp}
          ring="bg-emerald-50 text-emerald-600" accent={resumo.lucroBruto >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
        <KpiCard label="Lucro Líquido" value={fmtBRL(resumo.lucroLiquido)} icon={DollarSign}
          ring="bg-emerald-50 text-emerald-700" accent={resumo.lucroLiquido >= 0 ? 'text-emerald-700' : 'text-rose-600'} />
        <KpiCard label="Qtd Vendida" value={resumo.qtdVendas} icon={Package}
          ring="bg-amber-50 text-amber-600" />
      </div>

      {/* Charts: bar + donut */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Receita Bruta vs Lucro Líquido">
          {hasVendas ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false}
                  width={70} tickFormatter={(v) => brl.format(v)} />
                <Tooltip formatter={(v) => fmtBRL(v)} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={120}>
                  {barData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>

        <ChartCard title="Composição da Receita">
          {hasVendas ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={60} outerRadius={95} paddingAngle={2} stroke="none">
                  {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtBRL(v)} />
                <Legend verticalAlign="bottom" height={36} iconType="circle"
                  formatter={(val) => <span className="text-sm text-slate-600">{val}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>
      </div>

      {/* Line chart: trend */}
      <div className="mt-4">
        <ChartCard title="Tendência de Receita">
          {serie.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false}
                  width={70} tickFormatter={(v) => brl.format(v)} />
                <Tooltip formatter={(v) => fmtBRL(v)} />
                <Line type="monotone" dataKey="receita" stroke={COLORS.amber} strokeWidth={3}
                  dot={{ r: 3, fill: COLORS.amber }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState message="Dados insuficientes para a tendência (é preciso vendas em datas diferentes)." />}
        </ChartCard>
      </div>

      {/* Taxas settings */}
      <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-lg">⚙️</span>
          <h2 className="text-base font-semibold text-slate-800">Configurar Taxas</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FeeInput label="Débito (%)" value={fees.debitoPct}
            onChange={(v)=>setFees(prev=>({ ...prev, debitoPct: v }))} />
          <FeeInput label="Crédito à vista (%)" value={fees.creditoAVistaPct}
            onChange={(v)=>setFees(prev=>({ ...prev, creditoAVistaPct: v }))} />
          <FeeInput label="Crédito parcelado (por parcela %)" value={fees.creditoParceladoPct}
            onChange={(v)=>setFees(prev=>({ ...prev, creditoParceladoPct: v }))} />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button onClick={saveFees}
            className="rounded-lg bg-amber-400 px-5 py-2 font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500">
            Salvar
          </button>
          {saved && <span className="text-sm font-medium text-emerald-600">✓ Salvo</span>}
        </div>
      </div>
    </div>
  );
}

/* ---------- subcomponentes de UI ---------- */

function KpiCard({ label, value, icon: Icon, ring, accent }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${ring}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className={`mt-3 text-2xl font-bold ${accent || 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="h-72">{children}</div>
    </div>
  );
}

function FeeInput({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <input
        type="number" step="0.01" value={value}
        onChange={(e)=>onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
      />
    </label>
  );
}

function EmptyState({ message = 'Sem dados de vendas ainda.' }) {
  return (
    <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">
      {message}
    </div>
  );
}
