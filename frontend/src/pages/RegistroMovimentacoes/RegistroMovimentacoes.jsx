import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ClipboardList, Search, Battery, Music, PackageOpen, ChevronLeft, ChevronRight,
  ChevronDown, Wrench, Trash2, Package,
} from "lucide-react";
import { MovAPI } from "../../services/movimentacoes";
import { MovSomAPI } from "../../services/movimentacoesSom";
import { PedidoSomAPI } from "../../services/pedidoSom";
import { ESTOQUE_TIPOS } from "../../services/estoqueTipos";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/ConfirmDialog";

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
const fmtMoney = (n) => `R$ ${(Number(n) || 0).toFixed(2)}`;

function lerPagamentos() {
  try {
    return JSON.parse(localStorage.getItem(PAGAMENTO_KEY) || "{}");
  } catch {
    return {};
  }
}

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
  const toast = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [expandido, setExpandido] = useState(() => new Set());
  const [filtro, setFiltro] = useState("");
  const [tipoEstoque, setTipoEstoque] = useState(ESTOQUE_TIPOS.BATERIAS);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const isSom = tipoEstoque === ESTOQUE_TIPOS.SOM;

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

      // pedidos de instalação só na aba Som e apenas na primeira página
      if (linha === ESTOQUE_TIPOS.SOM && pg === 1) {
        const ped = await PedidoSomAPI.listar({ page: 1, pageSize: 50 });
        setPedidos(ped?.data || []);
      } else {
        setPedidos([]);
      }
    } catch (e) {
      console.error("GET movimentações ERRO:", e);
      setErrorMsg(e?.response?.data?.message || e?.message || "Falha ao carregar movimentações");
      setRows([]);
      setPedidos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setPage(1); setExpandido(new Set()); }, [filtro, tipoEstoque]);

  useEffect(() => {
    const t = setTimeout(() => carregar(filtro, page, tipoEstoque), 300);
    return () => clearTimeout(t);
  }, [filtro, page, tipoEstoque, carregar]);

  // Linha de movimentação simples nunca tem vendedor na aba Som.
  const hasVendedor = useMemo(() => rows.some((r) => r.vendedor), [rows]);
  const colCount = hasVendedor ? 8 : 7;

  // Mescla movimentações simples + pedidos (Som, página 1), por data desc.
  const linhasTabela = useMemo(() => {
    const movEntries = rows.map((r) => ({
      kind: "mov", key: `m-${r.id}`, sort: new Date(r.data).getTime() || 0, mov: r,
    }));
    if (!isSom) return movEntries;
    const pedEntries = pedidos.map((p) => ({
      kind: "pedido", key: `p-${p.id}`, sort: new Date(p.created_at).getTime() || 0, pedido: p,
    }));
    return [...movEntries, ...pedEntries].sort((a, b) => b.sort - a.sort);
  }, [rows, pedidos, isSom]);

  function toggleExpandir(id) {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function excluirPedido(p) {
    const ok = await confirm({
      title: "Excluir pedido",
      message: "Só é possível excluir pedidos do dia atual. As baixas de estoque serão revertidas. Continuar?",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    try {
      await PedidoSomAPI.remover(p.id);
      toast.success("Pedido excluído.");
      carregar(filtro, page, tipoEstoque);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao excluir pedido.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
            <ClipboardList size={24} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-800 md:text-2xl">Movimentações</h1>
            <p className="text-sm text-slate-500">Histórico de entradas, saídas e pedidos de instalação</p>
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
                {linhasTabela.map((entry) => {
                  if (entry.kind === "mov") {
                    const r = entry.mov;
                    const entrada = r.tipo === "ENTRADA";
                    const rowBg = entrada ? "bg-green-50 hover:bg-green-100/70" : "bg-red-50 hover:bg-red-100/70";
                    const tdBase = "px-3 py-2.5 text-slate-700";
                    return (
                      <tr key={entry.key} className={`border-t border-slate-100 transition-colors ${rowBg}`}>
                        <td className={`${tdBase} whitespace-nowrap`}>{fmtDataHora(r.data)}</td>
                        <td className={`${tdBase} font-semibold text-slate-800`}>{r.produto}</td>
                        <td className={tdBase}>{r.modelo}</td>
                        <td className={tdBase}>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            entrada ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          }`}>
                            {entrada ? "ENTRADA" : "SAÍDA"}
                          </span>
                        </td>
                        <td className={tdBase}>{r.quantidade}</td>
                        <td className={tdBase}>{fmtMoney(r.valorUnitario)}</td>
                        {hasVendedor && <td className={tdBase}>{r.vendedor || "—"}</td>}
                        <td className={tdBase}>{r.formaPagamento || "—"}</td>
                      </tr>
                    );
                  }

                  // ----- linha de PEDIDO DE INSTALAÇÃO -----
                  const p = entry.pedido;
                  const aberto = expandido.has(p.id);
                  const tdBase = "px-3 py-2.5 text-slate-700";
                  return (
                    <React.Fragment key={entry.key}>
                      <tr
                        onClick={() => toggleExpandir(p.id)}
                        className="cursor-pointer border-t border-slate-100 bg-purple-50 transition-colors hover:bg-purple-100/70"
                      >
                        <td className={`${tdBase} whitespace-nowrap`}>
                          <span className="inline-flex items-center gap-1">
                            <ChevronDown
                              size={14}
                              className={`text-purple-500 transition-transform ${aberto ? "" : "-rotate-90"}`}
                            />
                            {fmtDataHora(p.created_at)}
                          </span>
                        </td>
                        <td className={`${tdBase} font-semibold text-slate-800`}>
                          Pedido de instalação{p.veiculo ? ` · ${p.veiculo}` : ""}
                        </td>
                        <td className={tdBase}>{p.itens?.length ?? 0} item(ns)</td>
                        <td className={tdBase}>
                          <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
                            INSTALAÇÃO
                          </span>
                        </td>
                        <td className={tdBase}>{p.itens?.length ?? 0}</td>
                        <td className={`${tdBase} font-bold text-slate-800`}>{fmtMoney(p.valor_total)}</td>
                        {hasVendedor && <td className={tdBase}>—</td>}
                        <td className={tdBase}>{p.forma_pagamento || "—"}</td>
                      </tr>

                      {aberto && (
                        <tr className="bg-purple-50/40">
                          <td colSpan={colCount} className="px-4 py-3">
                            <div className="rounded-lg border border-purple-100 bg-white p-3">
                              <ul className="divide-y divide-slate-100">
                                {(p.itens || []).map((it) => (
                                  <li key={it.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                    <span className="flex items-center gap-2">
                                      {it.tipo === "MAO_OBRA"
                                        ? <Wrench size={14} className="text-amber-500" />
                                        : <Package size={14} className="text-slate-400" />}
                                      <span className="text-slate-700">{it.descricao}</span>
                                      <span className="text-xs text-slate-400">
                                        {it.quantidade} × {fmtMoney(it.valor_unit)}
                                      </span>
                                    </span>
                                    <span className="font-semibold text-slate-700">{fmtMoney(it.valor_total)}</span>
                                  </li>
                                ))}
                              </ul>

                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
                                <div className="text-slate-600">
                                  {Number(p.valor_mao_obra) > 0 && (
                                    <span className="mr-4">
                                      Mão de obra: <strong>{fmtMoney(p.valor_mao_obra)}</strong>
                                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                        Joel 30%: {fmtMoney(p.comissao_joel)}
                                      </span>
                                    </span>
                                  )}
                                  <span>Total: <strong className="text-slate-800">{fmtMoney(p.valor_total)}</strong></span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); excluirPedido(p); }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                                >
                                  <Trash2 size={14} /> Excluir pedido
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {!loading && linhasTabela.length === 0 && (
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

        {/* Paginação (movimentações simples) */}
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
