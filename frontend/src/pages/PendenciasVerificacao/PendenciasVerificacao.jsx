import React, { useCallback, useEffect, useState } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, PackageOpen, CheckCircle2 } from "lucide-react";
import { MovAPI } from "../../services/movimentacoes";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/ConfirmDialog";

const PAGE_SIZE = 20;

function fmtDataHora(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const fmtMoney = (n) => `R$ ${(Number(n) || 0).toFixed(2)}`;

function rotuloForma(forma, parcelas) {
  if (!forma) return "Sem forma registrada";
  if (forma === "credito") {
    const n = Number(parcelas || 1);
    return n > 1 ? `Crédito ${n}x` : "Crédito à vista";
  }
  return capitalize(forma);
}

function mapPendenciaToUi(row) {
  const quantidade = Number(row?.quantidade ?? 0);
  const valorUnitario = Number(row?.valor_final ?? 0);
  return {
    id: row?.id,
    data: row?.data_movimentacao,
    produto: row?.estoque?.produto ?? "—",
    modelo: row?.estoque?.modelo ?? "",
    quantidade,
    valorUnitario,
    valorTotal: valorUnitario * quantidade,
    formaPagamento: rotuloForma(row?.forma_pagamento, row?.parcelas),
    vendedor: row?.vendedor || row?.created_by || "—",
  };
}

export default function PendenciasVerificacao() {
  const toast = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [conferindo, setConferindo] = useState(null);

  const carregar = useCallback(async (pg) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await MovAPI.listarPendencias({ page: pg, pageSize: PAGE_SIZE });
      setRows((res?.data || []).map(mapPendenciaToUi));
      setPages(res?.pages || 1);
      setTotal(res?.total || 0);
    } catch (e) {
      console.error("GET pendências de verificação ERRO:", e);
      setErrorMsg(e?.response?.data?.message || e?.message || "Falha ao carregar pendências.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(page); }, [page, carregar]);

  async function conferir(r) {
    const ok = await confirm({
      title: "Conferir venda",
      message:
        `${r.produto}${r.modelo ? ` - ${r.modelo}` : ""}\n` +
        `${r.quantidade} un. × ${fmtMoney(r.valorUnitario)} = ${fmtMoney(r.valorTotal)} · ${r.formaPagamento}\n\n` +
        "Confirma que este valor bateu com o extrato do banco?",
      confirmLabel: "Confirmar conferência",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;

    setConferindo(r.id);
    try {
      await MovAPI.conferir(r.id);
      toast.success("Venda conferida.");
      // sai da fila: recarrega a página atual (pode ficar vazia se era a última)
      carregar(page);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao conferir venda.");
    } finally {
      setConferindo(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
            <BadgeCheck size={24} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-800 md:text-2xl">Pendências de Verificação</h1>
            <p className="text-sm text-slate-500">
              Vendas lançadas pela equipe, aguardando bater com o extrato do banco
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMsg}
          </div>
        )}
        {loading && <p className="mt-3 text-sm text-slate-400">Carregando...</p>}

        {/* Grid de pendências */}
        {!loading && rows.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm"
              >
                <div>
                  <p className="font-semibold text-slate-800">{r.produto}</p>
                  {r.modelo && <p className="text-sm text-slate-500">{r.modelo}</p>}
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-slate-500">{r.quantidade} un. × {fmtMoney(r.valorUnitario)}</span>
                  <span className="text-lg font-bold text-slate-800">{fmtMoney(r.valorTotal)}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 font-semibold text-slate-700 ring-1 ring-slate-200">
                    {r.formaPagamento}
                  </span>
                  <span className="text-slate-500">{r.vendedor}</span>
                </div>

                <p className="text-xs text-slate-400">{fmtDataHora(r.data)}</p>

                <button
                  type="button"
                  onClick={() => conferir(r)}
                  disabled={conferindo === r.id}
                  className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCircle2 size={16} />
                  {conferindo === r.id ? "Conferindo..." : "Conferir"}
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && rows.length === 0 && !errorMsg && (
          <div className="mt-10 flex flex-col items-center justify-center gap-3 text-center">
            <PackageOpen size={44} strokeWidth={1.4} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-500">Nenhuma venda pendente de conferência.</p>
          </div>
        )}

        {/* Paginação */}
        {pages > 1 && (
          <div className="mt-5 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {total} pendênci{total === 1 ? "a" : "as"} · página {page} de {pages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft size={16} /> Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages || loading}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próxima <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
