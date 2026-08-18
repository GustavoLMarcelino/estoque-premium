// Painel de Comissões — período quinzenal atual (ao vivo) + histórico dos
// períodos já fechados. O backend fecha os períodos passados automaticamente ao
// carregar este painel (fechamento preguiçoso, sem cron).
import React, { useEffect, useMemo, useState } from "react";
import {
  Coins, Battery, Wrench, Settings, CalendarRange, History, X, ChevronRight,
} from "lucide-react";
import { ComissaoAPI } from "../../services/comissao";
import GerenciarComissao from "../../components/GerenciarComissao";
import { useToast } from "../../components/ui/Toast";

const money = (n) => `R$ ${Number(n || 0).toFixed(2)}`;
const num = (n) => Number(n || 0);

const ICON_VENDEDOR = { BATERIA: Battery, MAO_OBRA: Wrench };

export default function PainelComissoes() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [periodos, setPeriodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [detalhe, setDetalhe] = useState(null); // período fechado selecionado
  const isAdmin = localStorage.getItem("role") === "admin";

  async function carregar() {
    setLoading(true);
    setErr("");
    try {
      const [painel, hist] = await Promise.all([ComissaoAPI.painel(), ComissaoAPI.periodos()]);
      setData(painel);
      setPeriodos(hist);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Falha ao carregar comissões.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPeriodo = useMemo(
    () => (data?.vendedores || []).reduce((acc, v) => acc + num(v.valor_comissao), 0),
    [data],
  );

  const config = data?.config || {};

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
              <Coins size={24} strokeWidth={2.2} />
            </span>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800">Comissões</h1>
              <p className="text-sm text-slate-500">Apuração quinzenal por vendedor</p>
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowConfig(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
            >
              <Settings size={16} />
              Configurar
            </button>
          )}
        </div>

        {err && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>
        )}
        {loading && <div className="mt-4 text-sm text-slate-400">Carregando…</div>}

        {data && (
          <>
            {/* Período atual */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CalendarRange size={16} className="text-amber-500" />
                Período atual: {data.periodo?.rotulo}
              </span>
              <span className="text-sm text-slate-500">
                Total do período: <strong className="text-slate-800">{money(totalPeriodo)}</strong>
              </span>
            </div>

            {/* Cards por vendedor */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.vendedores.map((v) => (
                <VendedorCard key={v.vendedor} v={v} config={config} />
              ))}
            </div>

            {/* Histórico */}
            <div className="mt-8">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                <History size={16} /> Períodos fechados
              </h2>
              <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                {periodos.length === 0 ? (
                  <div className="p-4 text-sm text-slate-400">Nenhum período fechado ainda.</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {periodos.map((p) => {
                      const total = (p.itens || []).reduce((acc, i) => acc + num(i.valor_comissao), 0);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => setDetalhe(p)}
                            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-amber-50"
                          >
                            <span className="text-sm font-medium text-slate-700">{p.rotulo}</span>
                            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                              {money(total)}
                              <ChevronRight size={16} className="text-slate-400" />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {showConfig && (
        <GerenciarComissao onClose={() => setShowConfig(false)} onSaved={carregar} />
      )}
      {detalhe && (
        <DetalhePeriodo periodo={detalhe} onClose={() => setDetalhe(null)} />
      )}
    </div>
  );
}

// Mão de obra mostra só a BASE, sem percentual: a % deixou de ser única em
// 17/08/2026 (cada item carrega a sua), então exibir um número só aqui
// explicaria o total errado.
function VendedorCard({ v, config }) {
  const Icon = ICON_VENDEDOR[v.tipo] || Coins;
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-2 text-slate-600">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
          <Icon size={18} />
        </span>
        <span className="text-sm font-bold text-slate-800">{v.vendedor}</span>
      </div>
      {v.tipo === "BATERIA" ? (
        <p className="mt-3 text-xs text-slate-500">
          {v.qtd_baterias} bateria(s) × {money(config.valor_bateria)}
        </p>
      ) : (
        <div className="mt-3 space-y-0.5 text-xs text-slate-500">
          <p>Mão de obra {money(v.base_mao_obra)}</p>
        </div>
      )}
      <p className="mt-1 text-2xl font-extrabold text-slate-900">{money(v.valor_comissao)}</p>
    </div>
  );
}

function DetalhePeriodo({ periodo, onClose }) {
  const total = (periodo.itens || []).reduce((acc, i) => acc + num(i.valor_comissao), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Período {periodo.rotulo}</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {(periodo.itens || []).map((i) => (
            <li key={i.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-slate-700">
                {i.vendedor}
                <span className="ml-2 text-xs text-slate-400">
                  {i.tipo === "MAO_OBRA" || num(i.base_mao_obra) > 0
                    ? money(i.base_mao_obra)
                    : `${i.qtd_baterias} × ${money(i.snap_valor_bateria)}`}
                </span>
              </span>
              <span className="text-sm font-semibold text-slate-800">{money(i.valor_comissao)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-base font-bold text-slate-800">Total</span>
          <span className="text-xl font-extrabold text-slate-900">{money(total)}</span>
        </div>
      </div>
    </div>
  );
}
