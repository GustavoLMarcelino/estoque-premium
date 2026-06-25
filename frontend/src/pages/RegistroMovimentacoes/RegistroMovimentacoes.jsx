import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ClipboardList, Search, Battery, Music, PackageOpen, ChevronLeft, ChevronRight,
} from "lucide-react";
import { MovAPI } from "../../services/movimentacoes";
import { MovSomAPI } from "../../services/movimentacoesSom";
import { ESTOQUE_TIPOS } from "../../services/estoqueTipos";

const PAGAMENTO_KEY = "movPagamentos";
const PAGE_SIZE = 20;

/* ===== helpers ===== */
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

// Metadados de pagamento ficam no localStorage, indexados pelo id da movimentação.
function lerPagamentos() {
  try {
    return JSON.parse(localStorage.getItem(PAGAMENTO_KEY) || "{}");
  } catch {
    return {};
  }
}

// Normaliza uma movimentação (com join de estoque) para a UI da tabela.
function mapMovToUi(row, pagamentos) {
  const tipo = String(row?.tipo || "").toUpperCase() === "ENTRADA" ? "ENTRADA" : "SAIDA";
  const pag = pagamentos[String(row?.id)] || {};
  const forma = pag.forma || row?.motivo || "";
  return {
    id: row?.id,
    data: row?.data_movimentacao,
    produto: row?.estoque?.produto ?? "—",
    modelo: row?.estoque?.modelo ?? "—",
    tipo,
    quantidade: Number(row?.quantidade ?? 0),
    valorUnitario: Number(row?.valor_final ?? 0),
    vendedor: row?.vendedor || "",
    formaPagamento: forma ? capitalize(forma) : "",
  };
}

export default function RegistroMovimentacoes() {
  const [rows, setRows] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [tipoEstoque, setTipoEstoque] = useState(ESTOQUE_TIPOS.BATERIAS);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const carregar = useCallback(async (q, pg, linha) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const service = linha === ESTOQUE_TIPOS.SOM ? MovSomAPI : MovAPI;
      const res = await service.listarPagina({ q, page: pg, pageSize: PAGE_SIZE });
      const pagamentos = lerPagamentos();
      setRows((res?.data || []).map((r) => mapMovToUi(r, pagamentos)));
      setPages(res?.pages || 1);
      setTotal(res?.total || 0);
    } catch (e) {
      console.error("GET /movimentacoes ERRO:", e);
      setErrorMsg(e?.response?.data?.message || e?.message || "Falha ao carregar movimentações");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Volta para a página 1 quando muda a busca ou a linha.
  useEffect(() => { setPage(1); }, [filtro, tipoEstoque]);

  // Carrega (com debounce na busca).
  useEffect(() => {
    const t = setTimeout(() => carregar(filtro, page, tipoEstoque), 300);
    return () => clearTimeout(t);
  }, [filtro, page, tipoEstoque, carregar]);

  const hasVendedor = useMemo(() => rows.some((r) => r.vendedor), [rows]);
  const colCount = hasVendedor ? 8 : 7;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
              <ClipboardList size={24} strokeWidth={2.2} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-800 md:text-2xl">Movimentações</h1>
              <p className="text-sm text-slate-500">Histórico de entradas e saídas do estoque</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Buscar produto ou modelo..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </div>

          {/* Baterias / Som pill buttons */}
          <div className="flex gap-2">
            {[
              { key: ESTOQUE_TIPOS.BATERIAS, label: "Baterias", Icon: Battery },
              { key: ESTOQUE_TIPOS.SOM, label: "Som", Icon: Music },
            ].map(({ key, label, Icon }) => {
              const active = tipoEstoque === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTipoEstoque(key)}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-amber-400 text-slate-900 shadow-sm"
                      : "border border-amber-300 bg-white text-amber-600 hover:bg-amber-50"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMsg}
          </div>
        )}

        {loading && <p className="mt-3 text-sm text-slate-400">Carregando...</p>}

        {/* Table */}
        <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-800 text-left text-xs font-semibold uppercase tracking-wide text-white">
                  <th className="px-3 py-2.5">Data</th>
                  <th className="px-3 py-2.5">Produto</th>
                  <th className="px-3 py-2.5">Modelo</th>
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5">Quantidade</th>
                  <th className="px-3 py-2.5">Valor Unitário</th>
                  {hasVendedor && <th className="px-3 py-2.5">Vendedor</th>}
                  <th className="px-3 py-2.5">Forma de Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const entrada = r.tipo === "ENTRADA";
                  const rowBg = entrada ? "bg-green-50 hover:bg-green-100/70" : "bg-red-50 hover:bg-red-100/70";
                  const tdBase = "px-3 py-2.5 text-slate-700";
                  return (
                    <tr key={r.id ?? idx} className={`border-t border-slate-100 transition-colors ${rowBg}`}>
                      <td className={`${tdBase} whitespace-nowrap`}>{fmtDataHora(r.data)}</td>
                      <td className={`${tdBase} font-semibold text-slate-800`}>{r.produto}</td>
                      <td className={tdBase}>{r.modelo}</td>
                      <td className={tdBase}>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            entrada ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {entrada ? "ENTRADA" : "SAÍDA"}
                        </span>
                      </td>
                      <td className={tdBase}>{r.quantidade}</td>
                      <td className={tdBase}>R$ {r.valorUnitario.toFixed(2)}</td>
                      {hasVendedor && <td className={tdBase}>{r.vendedor || "—"}</td>}
                      <td className={tdBase}>{r.formaPagamento || "—"}</td>
                    </tr>
                  );
                })}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-16">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <PackageOpen size={44} strokeWidth={1.4} className="text-slate-300" />
                        <p className="text-sm font-medium text-slate-500">Nenhuma movimentação encontrada.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paginação */}
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {total} movimentaç{total === 1 ? "ão" : "ões"} · página {page} de {pages}
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
