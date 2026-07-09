// Baterias emprestadas AGORA (garantias com empréstimo ativo não devolvido).
// Só leitura — a devolução acontece na tela da Garantia (botão Devolver ou ao
// Finalizar). Aqui a loja vê o que está fora do estoque e há quanto tempo.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BatteryCharging, Search, PackageOpen, Clock } from "lucide-react";
import { GarantiasAPI } from "../../services/garantias";
import { tempoEmprestada } from "../../utils/emprestimos";

const fmtData = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

export default function BateriasEmprestadas() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let alive = true;
    GarantiasAPI.emprestimosAtivos()
      .then((data) => { if (alive) setRows(data || []); })
      .catch((e) => { if (alive) setErro(e?.response?.data?.message || "Falha ao carregar empréstimos."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const totalQtd = rows.reduce((s, r) => s + Number(r.quantidade || 0), 0);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
              <BatteryCharging size={24} strokeWidth={2.2} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-800 md:text-2xl">Baterias Emprestadas</h1>
              <p className="text-sm text-slate-500">Baterias fora do estoque em garantias ainda não devolvidas.</p>
            </div>
          </div>
          {!loading && rows.length > 0 && (
            <span className="rounded-full bg-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-700">
              {rows.length} garantia{rows.length !== 1 ? "s" : ""} · {totalQtd} bateria{totalQtd !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {erro && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{erro}</div>
        )}

        <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-800 text-left text-xs font-semibold uppercase tracking-wide text-white">
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Marca</th>
                  <th className="px-4 py-3">Qtd</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Emprestada há</th>
                  <th className="px-4 py-3">Desde</th>
                  <th className="px-4 py-3 text-center">Garantia</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">Carregando...</td></tr>
                )}

                {!loading && rows.length === 0 && !erro && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <PackageOpen size={44} strokeWidth={1.4} className="text-slate-300" />
                        <p className="text-sm font-medium text-slate-500">Nenhuma bateria emprestada no momento.</p>
                      </div>
                    </td>
                  </tr>
                )}

                {!loading && rows.map((r) => (
                  <tr key={r.garantia_id} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60 hover:bg-amber-50/40">
                    <td className="px-4 py-3 font-semibold text-slate-800">{r.produto}</td>
                    <td className="px-4 py-3 text-slate-600">{r.marca || "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{r.quantidade}</td>
                    <td className="px-4 py-3 text-slate-700">{r.cliente_nome}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        <Clock size={12} /> {tempoEmprestada(r.desde)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmtData(r.desde)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        title="Abrir garantia"
                        onClick={() => navigate(`/garantia/${r.garantia_id}`)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800"
                      >
                        <Search size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
