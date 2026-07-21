// src/components/Inventario.jsx
// Inventário de Estoque (conferência física) — modal fullscreen.
// Props: linha ("BATERIAS" | "SOM"), onClose().
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ClipboardList, X, CheckCircle2, Circle, Loader2, History,
  PlayCircle, Trophy, ArrowLeft, Package, AlertTriangle,
} from "lucide-react";
import { InventarioAPI } from "../services/inventario";
import { getRole } from "../services/auth";
import { useToast } from "./ui/Toast";
import { useConfirm } from "./ui/ConfirmDialog";

const labelLinha = (linha) => (linha === "SOM" ? "Som" : "Baterias");

function fmtDataHora(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function Inventario({ linha = "BATERIAS", onClose }) {
  const toast = useToast();
  const confirm = useConfirm();

  const [mode, setMode] = useState("loading"); // loading | welcome | conference | finalized | history
  const [conferencia, setConferencia] = useState(null);
  const [busy, setBusy] = useState(false); // ação global (iniciar/finalizar/cancelar)
  const [savingId, setSavingId] = useState(null); // item sendo conferido/desconferido

  // "Divergiu": item com o campo de contagem aberto (um por vez).
  const [divergindoId, setDivergindoId] = useState(null);
  const [valorDivergencia, setValorDivergencia] = useState("");

  // histórico
  const [historico, setHistorico] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  // Histórico completo (as duas linhas + divergências) é só para admin; o
  // backend responde 403 aos demais — aqui só evitamos a chamada inútil.
  const [isAdmin] = useState(() => getRole() === "admin");

  /* ===== carga inicial: existe conferência ativa? ===== */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ativa = await InventarioAPI.ativa(linha);
        if (!alive) return;
        if (ativa) {
          setConferencia(ativa);
          setMode("conference");
        } else {
          setMode("welcome");
        }
      } catch (e) {
        if (!alive) return;
        toast.error(e?.response?.data?.message || "Falha ao carregar inventário.");
        setMode("welcome");
      }
    })();
    return () => { alive = false; };
  }, [linha, toast]);

  const itens = conferencia?.itens ?? [];
  const total = itens.length;
  const conferidos = useMemo(() => itens.filter((i) => i.conferido).length, [itens]);
  const pct = total ? Math.round((conferidos / total) * 100) : 0;
  const todosConferidos = total > 0 && conferidos === total;

  // pendentes primeiro, conferidos depois (ordem estável por produto)
  const itensOrdenados = useMemo(() => {
    return [...itens].sort((a, b) => {
      if (a.conferido !== b.conferido) return a.conferido ? 1 : -1;
      return String(a.produto || "").localeCompare(String(b.produto || ""));
    });
  }, [itens]);

  /* ===== ações ===== */
  async function iniciar() {
    setBusy(true);
    try {
      const conf = await InventarioAPI.iniciar(linha);
      setConferencia(conf);
      setMode("conference");
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao iniciar inventário.");
    } finally {
      setBusy(false);
    }
  }

  // Um toque = "bateu" (qtdContada undefined → backend usa qtd_sistema).
  // Com qtdContada = contagem real digitada no "Divergiu".
  const toggleItem = useCallback(async (item, qtdContada) => {
    if (savingId) return;
    // "Divergiu" sempre CONFIRMA com o número; o toque simples alterna.
    const novoConferido = qtdContada !== undefined ? true : !item.conferido;
    const novaQtd = novoConferido
      ? (qtdContada !== undefined ? Number(qtdContada) : item.qtd_sistema)
      : null;
    setSavingId(item.id);
    // atualização otimista
    setConferencia((prev) => prev && {
      ...prev,
      itens: prev.itens.map((i) =>
        i.id === item.id ? { ...i, conferido: novoConferido, qtd_contada: novaQtd } : i
      ),
    });
    try {
      if (novoConferido) await InventarioAPI.conferir(item.id, qtdContada);
      else await InventarioAPI.desconferir(item.id);
    } catch (e) {
      // reverte em caso de erro
      setConferencia((prev) => prev && {
        ...prev,
        itens: prev.itens.map((i) =>
          i.id === item.id ? { ...i, conferido: item.conferido, qtd_contada: item.qtd_contada ?? null } : i
        ),
      });
      toast.error(e?.response?.data?.message || "Falha ao salvar conferência.");
    } finally {
      setSavingId(null);
    }
  }, [savingId, toast]);

  async function finalizar() {
    const ok = await confirm({
      title: "Finalizar inventário",
      message: "Todos os itens foram conferidos. Deseja finalizar o inventário?",
      confirmLabel: "Finalizar",
      cancelLabel: "Voltar",
      tone: "default",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await InventarioAPI.finalizar(conferencia.id);
      setMode("finalized");
      toast.success("Inventário finalizado com sucesso!");
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao finalizar inventário.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelar() {
    const ok = await confirm({
      title: "Cancelar inventário",
      message: "O inventário em andamento será perdido. Deseja cancelar?",
      confirmLabel: "Cancelar Inventário",
      cancelLabel: "Voltar",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await InventarioAPI.cancelar(conferencia.id);
      toast.success("Inventário cancelado.");
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao cancelar inventário.");
    } finally {
      setBusy(false);
    }
  }

  function abrirDivergencia(item) {
    setDivergindoId(item.id);
    // Pré-preenche com o que já foi contado; senão vazio (não sugere o número
    // do sistema, que enviesaria a contagem).
    setValorDivergencia(item.qtd_contada != null ? String(item.qtd_contada) : "");
  }

  function confirmarDivergencia(item) {
    const n = Number(valorDivergencia);
    if (valorDivergencia === "" || !Number.isInteger(n) || n < 0) {
      toast.error("Informe a quantidade real contada (número inteiro, 0 ou mais).");
      return;
    }
    setDivergindoId(null);
    toggleItem(item, n);
  }

  const carregarHistorico = useCallback(async () => {
    setHistLoading(true);
    try {
      // Admin vê as duas linhas com divergências; operador, a lista simples da
      // linha dele (endpoint antigo, que segue aberto).
      const res = isAdmin
        ? await InventarioAPI.historicoCompleto({ page: 1, pageSize: 50 })
        : await InventarioAPI.historico(linha, { page: 1, pageSize: 50 });
      setHistorico(res?.data ?? []);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao carregar histórico.");
    } finally {
      setHistLoading(false);
    }
  }, [linha, toast, isAdmin]);

  function verHistorico() {
    setMode("history");
    carregarHistorico();
  }

  /* ===== UI ===== */
  const body = (
    <div className="fixed inset-0 z-[9990] flex items-stretch justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-3xl flex-col overflow-hidden bg-slate-100 shadow-2xl sm:rounded-2xl">
        {/* Barra superior */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
              <ClipboardList size={20} strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Inventário de {labelLinha(linha)}</h2>
              {mode === "conference" && (
                <p className="text-sm text-slate-500">{conferidos} de {total} conferidos</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* ---- Loading ---- */}
          {mode === "loading" && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="animate-spin" size={32} />
              <p className="mt-3 text-sm">Carregando…</p>
            </div>
          )}

          {/* ---- Boas-vindas ---- */}
          {mode === "welcome" && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-100 text-amber-500">
                <ClipboardList size={40} strokeWidth={1.8} />
              </span>
              <h3 className="mt-5 text-xl font-bold text-slate-800">Inventário de {labelLinha(linha)}</h3>
              <p className="mt-1 text-sm text-slate-500">Nenhum inventário em andamento</p>
              <button
                type="button"
                onClick={iniciar}
                disabled={busy}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-3 font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <PlayCircle size={18} strokeWidth={2.2} />}
                Iniciar Inventário
              </button>
              <button
                type="button"
                onClick={verHistorico}
                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-amber-600"
              >
                <History size={16} /> Ver histórico
              </button>
            </div>
          )}

          {/* ---- Conferência ---- */}
          {mode === "conference" && (
            <>
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
                  <span>Progresso</span>
                  <span>{conferidos}/{total} ({pct}%)</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <ul className="mt-4 space-y-2">
                {itensOrdenados.map((item) => {
                  const divergiu = item.conferido && item.qtd_contada != null
                    && item.qtd_contada !== item.qtd_sistema;
                  return (
                    <li key={item.id}>
                      {/* Caixa visual: o toque rápido continua sendo um toque no
                          corpo; "Divergiu" é um botão irmão (nunca aninhado). */}
                      <div
                        className={`rounded-xl border transition-colors ${
                          divergiu
                            ? "border-rose-200 bg-rose-50"
                            : item.conferido
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2 px-2 py-2 sm:px-3">
                          <button
                            type="button"
                            onClick={() => toggleItem(item)}
                            disabled={savingId === item.id}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-black/[0.03]"
                          >
                            {savingId === item.id ? (
                              <Loader2 size={22} className="shrink-0 animate-spin text-slate-400" />
                            ) : divergiu ? (
                              <AlertTriangle size={22} className="shrink-0 text-rose-500" />
                            ) : item.conferido ? (
                              <CheckCircle2 size={22} className="shrink-0 text-emerald-500" />
                            ) : (
                              <Circle size={22} className="shrink-0 text-slate-300" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className={`truncate font-semibold ${
                                divergiu ? "text-rose-800" : item.conferido ? "text-emerald-800" : "text-slate-800"
                              }`}>
                                {item.produto || "—"}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                Modelo: {item.modelo || "—"}
                                {divergiu && ` · contado ${item.qtd_contada}`}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="block text-xs text-slate-400">No sistema</span>
                              <span className="text-base font-bold text-slate-700">{item.qtd_sistema}</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => abrirDivergencia(item)}
                            disabled={savingId === item.id}
                            className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-2 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-50 disabled:opacity-50"
                          >
                            Divergiu
                          </button>
                        </div>

                        {divergindoId === item.id && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 px-3 py-2.5">
                            <label className="text-xs font-medium text-slate-600">
                              Quantidade real contada:
                            </label>
                            <input
                              type="number" min="0" step="1" inputMode="numeric" autoFocus
                              value={valorDivergencia}
                              onChange={(e) => setValorDivergencia(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); confirmarDivergencia(item); }
                                if (e.key === "Escape") setDivergindoId(null);
                              }}
                              className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                            />
                            <button
                              type="button"
                              onClick={() => confirmarDivergencia(item)}
                              className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-500"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setDivergindoId(null)}
                              className="rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
                {total === 0 && (
                  <li className="flex flex-col items-center py-12 text-slate-400">
                    <Package size={32} />
                    <p className="mt-2 text-sm">Nenhum produto nesta linha para conferir.</p>
                  </li>
                )}
              </ul>
            </>
          )}

          {/* ---- Finalizado ---- */}
          {mode === "finalized" && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-500">
                <Trophy size={40} strokeWidth={1.8} />
              </span>
              <h3 className="mt-5 text-xl font-bold text-slate-800">Inventário finalizado!</h3>
              <p className="mt-1 text-sm text-slate-500">A conferência de {labelLinha(linha)} foi concluída.</p>
              <button
                type="button"
                onClick={verHistorico}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-3 font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500"
              >
                <History size={18} /> Ver Histórico
              </button>
            </div>
          )}

          {/* ---- Histórico ---- */}
          {mode === "history" && (
            <div>
              <button
                type="button"
                onClick={() => setMode(conferencia && conferencia.status === "EM_ANDAMENTO" ? "conference" : "welcome")}
                className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-amber-600"
              >
                <ArrowLeft size={16} /> Voltar
              </button>
              <h3 className="text-base font-bold text-slate-800">Histórico de conferências</h3>

              {histLoading ? (
                <div className="flex items-center gap-2 py-10 text-slate-400">
                  <Loader2 className="animate-spin" size={20} /> Carregando…
                </div>
              ) : historico.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">Nenhuma conferência finalizada ainda.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {historico.map((h) => {
                    // Conferências anteriores a esta feature não têm resumo:
                    // mostram "—" em vez de número inventado.
                    const semResumo = h.total_itens == null;
                    const divs = h.total_divergencias;
                    return (
                      <li
                        key={h.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">
                            {fmtDataHora(h.finalizada_at)}
                            {isAdmin && h.linha && (
                              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                {labelLinha(h.linha)}
                              </span>
                            )}
                          </p>
                          {/* Quem FINALIZOU. created_by (quem iniciou) só
                              aparece como fallback nas conferências antigas. */}
                          <p className="text-xs text-slate-500">Por {h.finalizada_por || h.created_by || "—"}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            {semResumo ? "—" : `${h.total_conferidos}/${h.total_itens}`} conferidos
                          </span>
                          {isAdmin && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                divs == null
                                  ? "bg-slate-100 text-slate-500"
                                  : divs > 0
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {divs == null
                                ? "sem dados de divergência"
                                : divs === 0
                                ? "sem divergências"
                                : `${divs} ${divs === 1 ? "divergência" : "divergências"}`}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Rodapé (apenas na conferência) */}
        {mode === "conference" && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
            <button
              type="button"
              onClick={cancelar}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Cancelar Inventário
            </button>
            <button
              type="button"
              onClick={finalizar}
              disabled={busy || !todosConferidos}
              title={!todosConferidos ? "Confira todos os itens para finalizar" : undefined}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} strokeWidth={2.2} />}
              Finalizar Inventário
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
