// src/pages/Dashboards/Dashboards.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  PieChart, Pie,
  LineChart, Line,
} from 'recharts';
import {
  Wallet, TrendingUp, DollarSign, Package, BatteryCharging, Clock, ArrowRight,
  AlertTriangle, Battery, Music, Layers, ClipboardList, Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { VendasResumoAPI } from '../../services/vendasResumo';
import { GarantiasAPI } from '../../services/garantias';
import { TaxasAPI } from '../../services/taxas';
import { getRole, temLinha } from '../../services/auth';
import { tempoEmprestada } from '../../utils/emprestimos';

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

const FACES = { BATERIAS: 'baterias', SOM: 'som', AMBOS: 'ambos' };

export default function Dashboards() {
  const isAdmin = getRole() === 'admin';
  // Escopo de linha, mesmo padrão do toggle de Movimentações. Só quem opera as
  // duas linhas enxerga "Ambos". A aba em si segue sendo de linha 'baterias'.
  const verBaterias = temLinha('baterias');
  const verSom = temLinha('som');

  // { total, baterias|null, som|null } — as três faces numa chamada só.
  const [resumoLinhas, setResumoLinhas] = useState(null);
  const [face, setFace] = useState(verBaterias ? FACES.BATERIAS : FACES.SOM);
  const [emprestimos, setEmprestimos] = useState([]); // baterias emprestadas agora

  // Config de taxas (só admin edita; carregada do banco). null = ainda carregando.
  const [taxasCfg, setTaxasCfg] = useState(null);
  const [savingTaxas, setSavingTaxas] = useState(false);
  const [taxasSaved, setTaxasSaved] = useState(false);

  useEffect(()=>{
    if (!isAdmin) return;
    TaxasAPI.getConfig()
      .then((cfg) => setTaxasCfg(cfg))
      .catch((e) => console.error('Taxas config fetch error', e));
  }, [isAdmin]);

  useEffect(()=>{
    (async ()=>{
      try {
        // KPIs agregados no banco (todas as vendas das duas linhas, custo via
        // lookup) — taxa e lucro líquido já vêm calculados do servidor
        // (forma_pagamento + parcelas do banco × taxas_config).
        setResumoLinhas(await VendasResumoAPI.resumo());
      } catch (e) {
        console.error('Dash fetch error', e);
      }
      // Garantia é conceito de Baterias: nem busca para quem não opera a linha.
      if (!verBaterias) return;
      try {
        setEmprestimos(await GarantiasAPI.emprestimosAtivos());
      } catch (e) {
        console.error('Empréstimos fetch error', e);
      }
    })();
  }, [verBaterias]);

  const totalEmprestado = emprestimos.reduce((s, r) => s + Number(r.quantidade || 0), 0);

  // Faces disponíveis: cruzamento do escopo do usuário com o que o payload
  // trouxe (bloco null = linha fora do escopo, resolvido no servidor).
  const faces = useMemo(()=> {
    const temBaterias = verBaterias && !!resumoLinhas?.baterias;
    const temSom = verSom && !!resumoLinhas?.som;
    return [
      ...(temBaterias ? [{ key: FACES.BATERIAS, label: 'Baterias', Icon: Battery }] : []),
      ...(temSom ? [{ key: FACES.SOM, label: 'Som', Icon: Music }] : []),
      ...(temBaterias && temSom ? [{ key: FACES.AMBOS, label: 'Ambos', Icon: Layers }] : []),
    ];
  }, [resumoLinhas, verBaterias, verSom]);

  // Se a face corrente não existe (usuário de uma linha só), cai na primeira.
  useEffect(()=> {
    if (faces.length && !faces.some((f) => f.key === face)) setFace(faces[0].key);
  }, [faces, face]);

  const isSom = face === FACES.SOM;
  const isAmbos = face === FACES.AMBOS;

  // Bloco da face escolhida. Trocar de face NÃO refaz o fetch.
  const bloco = useMemo(()=> {
    if (!resumoLinhas) return null;
    if (isAmbos) return resumoLinhas.total;
    return resumoLinhas[face] || null;
  }, [resumoLinhas, face, isAmbos]);

  // Sem permissão de custo o servidor OMITE custoVendido/lucroBruto/lucroLiquido.
  // Ausente ≠ zero: os cards e gráficos de lucro somem em vez de exibir R$ 0,00.
  const verCusto = bloco?.lucroBruto !== undefined;

  const resumo = useMemo(()=> {
    const a = bloco || {};
    return {
      vendasBrutas: Number(a.vendasBrutas || 0),
      custoVendido: Number(a.custoVendido || 0),
      taxas: Number(a.taxas || 0),
      lucroBruto: Number(a.lucroBruto || 0),
      lucroLiquido: Number(a.lucroLiquido || 0),
      qtdVendas: Number(a.qtdVendas || 0),
      vendasSemForma: a.vendasSemForma || { qtd: 0, receita: 0 },
      // Recorte de vendasBrutas, não uma parcela dela: a venda fiado já está na
      // receita (competência). Só Baterias produz fiado; em Som vem zerado.
      aReceber: a.aReceber || { qtd: 0, valor: 0 },
      // Exclusivos de Som — o bloco "Ambos" não os traz (somá-los a Baterias
      // não significaria nada), por isso ficam undefined lá.
      qtdPedidos: a.qtdPedidos,
      receitaProdutos: a.receitaProdutos,
      receitaMaoObra: a.receitaMaoObra,
      saidasSemPedido: a.saidasSemPedido,
    };
  }, [bloco]);

  // Série temporal de receita (agregada por dia no backend).
  const serie = useMemo(()=> {
    return (bloco?.seriePorDia || []).map(({ dia, receita }) => ({
      label: dia.slice(8, 10) + '/' + dia.slice(5, 7), // dd/MM
      receita,
    }));
  }, [bloco]);

  const barData = [
    { name: 'Receita Bruta', value: resumo.vendasBrutas, fill: COLORS.receita },
    { name: 'Lucro Líquido', value: resumo.lucroLiquido, fill: COLORS.lucro },
  ];

  const pieData = [
    { name: 'Custo dos vendidos', value: Math.max(0, resumo.custoVendido), color: COLORS.custo },
    { name: 'Taxas de máquina', value: Math.max(0, resumo.taxas), color: COLORS.taxas },
    { name: 'Lucro líquido', value: Math.max(0, resumo.lucroLiquido), color: COLORS.lucro },
  ];

  // Critério de "tem o que mostrar" é RECEITA, não quantidade: em Som um pedido
  // só de serviço não move estoque (qtdVendas 0) mas fatura.
  const hasReceita = resumo.vendasBrutas > 0;

  const setTaxa = (campo, v) => setTaxasCfg((prev) => ({ ...prev, [campo]: v }));

  async function saveTaxas() {
    if (!taxasCfg) return;
    setSavingTaxas(true);
    try {
      const payload = {
        pix_pct: Number(taxasCfg.pix_pct) || 0,
        debito_pct: Number(taxasCfg.debito_pct) || 0,
        credito_avista_pct: Number(taxasCfg.credito_avista_pct) || 0,
        credito_2a6_pct: Number(taxasCfg.credito_2a6_pct) || 0,
        credito_7a12_pct: Number(taxasCfg.credito_7a12_pct) || 0,
        antecipacao_mes_pct: Number(taxasCfg.antecipacao_mes_pct) || 0,
      };
      const cfg = await TaxasAPI.salvarConfig(payload);
      setTaxasCfg(cfg);
      setTaxasSaved(true);
      setTimeout(() => setTaxasSaved(false), 2000);
      // Recarrega o resumo: a taxa/lucro líquido são recalculados no servidor.
      VendasResumoAPI.resumo().then(setResumoLinhas).catch(() => {});
    } catch (e) {
      console.error('Salvar taxas erro', e);
    } finally {
      setSavingTaxas(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      {/* Header */}
      <div className="rounded-2xl bg-slate-900 px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="h-8 w-1.5 rounded-full bg-amber-400" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">Dashboards</h1>
              <p className="text-sm text-slate-300">Visão geral de vendas, lucro e taxas</p>
            </div>
          </div>

          {/* Toggle de linha: só aparece para quem opera mais de uma face. */}
          {faces.length > 1 && (
            <div className="flex gap-2">
              {faces.map(({ key, label, Icon }) => {
                const active = face === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFace(key)}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-amber-400 text-slate-900 shadow-sm'
                        : 'border border-amber-300/60 bg-transparent text-amber-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* KPI cards. Os de lucro só entram na lista quando o servidor mandou
          custo — sem permissão eles somem, em vez de mostrar R$ 0,00 falso. */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Receita Bruta" value={fmtBRL(resumo.vendasBrutas)} icon={Wallet}
          ring="bg-sky-50 text-sky-600"
          hint={isSom ? 'Peças + mão de obra' : undefined} />

        {/* Condicional: sem fiado no período o card não aparece. Um "R$ 0,00 a
            receber" permanente ocupa espaço para dizer que não há notícia. */}
        {resumo.aReceber.qtd > 0 && (
          <KpiCard label="A Receber" value={fmtBRL(resumo.aReceber.valor)} icon={Clock}
            ring="bg-amber-50 text-amber-600"
            hint={`${resumo.aReceber.qtd} venda(s) fiado — já na receita`} />
        )}

        {verCusto && (
          <KpiCard label="Lucro Bruto" value={fmtBRL(resumo.lucroBruto)} icon={TrendingUp}
            ring="bg-emerald-50 text-emerald-600"
            accent={resumo.lucroBruto >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
        )}
        {verCusto && (
          <KpiCard label="Lucro Líquido" value={fmtBRL(resumo.lucroLiquido)} icon={DollarSign}
            ring="bg-emerald-50 text-emerald-700"
            accent={resumo.lucroLiquido >= 0 ? 'text-emerald-700' : 'text-rose-600'} />
        )}

        <KpiCard label="Qtd Vendida" value={resumo.qtdVendas} icon={Package}
          ring="bg-amber-50 text-amber-600"
          hint={isSom ? 'Unidades de produto' : undefined} />

        {/* Som: um pedido pode ter vários itens (ou nenhum, se for só serviço),
            então "atendimentos" é uma contagem diferente de "qtd vendida". */}
        {isSom && resumo.qtdPedidos !== undefined && (
          <KpiCard label="Atendimentos" value={resumo.qtdPedidos} icon={ClipboardList}
            ring="bg-slate-100 text-slate-600" hint="Pedidos de instalação" />
        )}
      </div>

      {/* Som: a receita quebrada. Mão de obra não tem custo de produto — sem
          separar, um pedido de serviço apareceria com margem ~100%. */}
      {isSom && resumo.receitaProdutos !== undefined && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KpiCard label="Receita de Produtos" value={fmtBRL(resumo.receitaProdutos)} icon={Package}
            ring="bg-sky-50 text-sky-600" hint="Peças vendidas (têm custo)" />
          <KpiCard label="Receita de Mão de Obra" value={fmtBRL(resumo.receitaMaoObra)} icon={Wrench}
            ring="bg-violet-50 text-violet-600" hint="Serviço (sem custo de produto)" />
        </div>
      )}

      {/* Baterias emprestadas agora (empréstimo não é venda nem perda).
          Conceito de Baterias: some na face Som. */}
      {!isSom && verBaterias && (
        <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <BatteryCharging size={20} strokeWidth={2.2} />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Baterias emprestadas agora</h2>
                <p className="text-xs text-slate-500">
                  {emprestimos.length === 0
                    ? 'Nenhuma bateria emprestada no momento.'
                    : `${emprestimos.length} garantia${emprestimos.length !== 1 ? 's' : ''} · ${totalEmprestado} bateria${totalEmprestado !== 1 ? 's' : ''} fora do estoque`}
                </p>
              </div>
            </div>
            <Link to="/emprestimos" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50">
              Ver todas <ArrowRight size={14} />
            </Link>
          </div>

          {emprestimos.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100">
              {emprestimos.slice(0, 5).map((r) => (
                <li key={r.garantia_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                    {r.produto}
                    <span className="ml-2 text-xs text-slate-400">{r.cliente_nome}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-slate-500">Qtd: {r.quantidade}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                      <Clock size={12} /> {tempoEmprestada(r.desde)}
                    </span>
                  </span>
                </li>
              ))}
              {emprestimos.length > 5 && (
                <li className="pt-2 text-xs text-slate-400">+ {emprestimos.length - 5} outra(s)…</li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Charts: bar + donut. Os dois dependem de lucro/custo — sem permissão
          de custo saem do ar (mostrar zero seria informação falsa). */}
      {verCusto && (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Receita Bruta vs Lucro Líquido">
            {hasReceita ? (
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
            {hasReceita ? (
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
      )}

      {/* Line chart: trend. Só depende de receita — vale em qualquer permissão. */}
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

      {/* Aviso: vendas sem forma de pagamento — ou crédito sem nº de parcelas,
          que o servidor também sinaliza aqui em vez de taxar como 1x. */}
      {resumo.vendasSemForma.qtd > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{resumo.vendasSemForma.qtd} venda(s)</span> sem forma de
            pagamento registrada — ou no crédito sem o nº de parcelas —{' '}
            ({fmtBRL(resumo.vendasSemForma.receita)} em receita). Essas vendas
            entram com <span className="font-semibold">taxa zero</span> — o lucro líquido pode estar
            superestimado até que a forma de pagamento seja informada.
          </p>
        </div>
      )}

      {/* Aviso (Som): saídas de estoque lançadas fora de um pedido. Não têm
          receita registrada, então não entram no faturamento — mas são peça
          saindo do estoque, e o custo delas não aparece em lugar nenhum. */}
      {isSom && resumo.saidasSemPedido?.movimentacoes > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{resumo.saidasSemPedido.movimentacoes} saída(s)</span> de
            estoque de Som ({resumo.saidasSemPedido.unidades} unidade(s)) lançadas{' '}
            <span className="font-semibold">sem pedido de instalação</span>. Como não têm valor de
            venda registrado, ficam de fora do faturamento e do lucro acima.
          </p>
        </div>
      )}

      {/* Configurar Taxas — só admin (envolve o custo real da maquininha).
          Config global da maquininha: vale para as duas linhas, em qualquer face. */}
      {isAdmin && (
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <h2 className="text-base font-semibold text-slate-800">Configurar Taxas</h2>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            Percentuais da maquininha (por operação). O crédito parcelado soma a antecipação
            (desconto composto a valor presente) sobre a intermediação da faixa.
          </p>

          {!taxasCfg ? (
            <p className="text-sm text-slate-400">Carregando…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FeeInput label="Pix (%)" value={taxasCfg.pix_pct}
                  onChange={(v)=>setTaxa('pix_pct', v)} />
                <FeeInput label="Débito (%)" value={taxasCfg.debito_pct}
                  onChange={(v)=>setTaxa('debito_pct', v)} />
                <FeeInput label="Crédito à vista — 1x (%)" value={taxasCfg.credito_avista_pct}
                  onChange={(v)=>setTaxa('credito_avista_pct', v)} />
                <FeeInput label="Crédito 2x–6x — base (%)" value={taxasCfg.credito_2a6_pct}
                  onChange={(v)=>setTaxa('credito_2a6_pct', v)} />
                <FeeInput label="Crédito 7x–10x — base (%)" value={taxasCfg.credito_7a12_pct}
                  onChange={(v)=>setTaxa('credito_7a12_pct', v)} />
                <FeeInput label="Antecipação (% ao mês)" value={taxasCfg.antecipacao_mes_pct}
                  onChange={(v)=>setTaxa('antecipacao_mes_pct', v)} />
              </div>

              <div className="mt-5 flex items-center gap-3">
                <button onClick={saveTaxas} disabled={savingTaxas}
                  className="rounded-lg bg-amber-400 px-5 py-2 font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500 disabled:opacity-60">
                  {savingTaxas ? 'Salvando…' : 'Salvar'}
                </button>
                {taxasSaved && <span className="text-sm font-medium text-emerald-600">✓ Salvo</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- subcomponentes de UI ---------- */

function KpiCard({ label, value, icon: Icon, ring, accent, hint }) {
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
