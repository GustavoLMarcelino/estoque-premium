// src/components/InventarioDetalhe.jsx
// Itens que DIVERGIRAM numa conferência finalizada. Usado logo após finalizar e
// ao abrir uma conferência do histórico (mesmo componente nos dois lugares).
import React, { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { InventarioAPI } from "../services/inventario";

const fmtDif = (d) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0");

export default function InventarioDetalhe({ conferenciaId }) {
  const [det, setDet] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let alive = true;
    setDet(null);
    setErro("");
    InventarioAPI.detalhe(conferenciaId, { soDivergentes: true })
      .then((d) => alive && setDet(d))
      .catch((e) => alive && setErro(e?.response?.data?.message || "Falha ao carregar a conferência."));
    return () => { alive = false; };
  }, [conferenciaId]);

  if (erro) {
    return <p className="py-8 text-center text-sm text-rose-600">{erro}</p>;
  }
  if (!det) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
        <Loader2 className="animate-spin" size={20} /> Carregando…
      </div>
    );
  }
  if (det.sem_dados_divergencia) {
    return (
      <div className="flex flex-col items-center py-10 text-center text-slate-500">
        <Info size={32} className="text-slate-400" />
        <p className="mt-2 text-sm font-medium">Sem dados de divergência</p>
        <p className="text-xs text-slate-400">Esta conferência é anterior ao registro de contagens.</p>
      </div>
    );
  }
  if (det.itens.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center text-emerald-600">
        <CheckCircle2 size={36} />
        <p className="mt-2 text-base font-bold">Tudo bateu</p>
        <p className="text-xs text-slate-500">Nenhuma divergência nesta conferência.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-rose-700">
        <AlertTriangle size={16} />
        {det.itens.length} {det.itens.length === 1 ? "item divergiu" : "itens divergiram"}
      </p>
      <ul className="space-y-2">
        {det.itens.map((it) => (
          <li key={it.id} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate font-semibold text-rose-900">{it.produto || "—"}</p>
                <p className="truncate text-xs text-slate-500">Modelo: {it.modelo || "—"}</p>
              </div>
              <dl className="grid shrink-0 grid-cols-3 gap-3 text-center">
                <div>
                  <dt className="text-[11px] text-slate-400">Sistema</dt>
                  <dd className="text-base font-bold text-slate-700">{it.qtd_sistema}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400">Contado</dt>
                  <dd className="text-base font-bold text-slate-700">{it.qtd_contada}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400">Diferença</dt>
                  <dd className={`text-base font-bold ${it.diferenca > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmtDif(it.diferenca)}
                  </dd>
                </div>
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
