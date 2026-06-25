import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Pencil, Trash2, ArrowUp, ArrowDown, PackageOpen,
  ChevronUp, ChevronDown, ClipboardList, Calculator, RotateCcw,
} from "lucide-react";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import Inventario from "../Inventario";
import { calcularPrecos } from "../../utils/precos";

/* ===== helpers de garantia ===== */
function formatGarantia(v) {
  if (v === null || v === undefined) return "0 meses";
  const s = String(v).trim();
  if (!s || /nan/i.test(s)) return "0 meses";
  if (s.toLowerCase().includes("mes")) {
    const m = s.match(/\d+/);
    const n = m ? parseInt(m[0], 10) : 0;
    return Number.isFinite(n) ? `${n} meses` : "0 meses";
  }
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? `${n} meses` : "0 meses";
}
function garantiaToNumber(v) {
  if (v === null || v === undefined) return 0;
  const m = String(v).match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

/* ===== mapping DB <-> UI ===== */
function mapDbToUi(row) {
  const custo = Number(row?.custo ?? 0);
  const valorVenda = Number(row?.valor_venda ?? 0);
  return {
    id: row.id,
    nome: row?.produto ?? "",
    modelo: row?.modelo ?? "",
    custo,
    valorVenda,
    percentualLucro: row?.percentual_lucro != null ? Number(row.percentual_lucro) : "",
    valorVista: row?.valor_vista != null ? Number(row.valor_vista) : null,
    valorParcelado: row?.valor_parcelado != null ? Number(row.valor_parcelado) : null,
    quantidadeMinima: Number(row?.qtd_minima ?? 0),
    garantia: formatGarantia(row?.garantia),
    quantidadeInicial: Number(row?.qtd_inicial ?? 0),
    entradas: Number(row?.entradas ?? 0),
    saidas: Number(row?.saidas ?? 0),
    emEstoque:
      Number(row?.em_estoque ??
        (Number(row?.qtd_inicial ?? 0) + Number(row?.entradas ?? 0) - Number(row?.saidas ?? 0))),
  };
}
function mapUiToDb(p) {
  const toMoney = (n) => (n === "" || n == null ? null : Number(n).toFixed(2));
  const toInt = (n) => {
    const v = parseInt(n, 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  const vista = p.valorVista === "" || p.valorVista == null ? null : Number(p.valorVista);
  return {
    produto: p.nome,
    modelo: p.modelo,
    custo: toMoney(p.custo),
    // valor_venda espelha o valor à vista (novo papel)
    valor_venda: vista != null ? toMoney(vista) : toMoney(p.valorVenda),
    valor_vista: vista != null ? toMoney(vista) : null,
    valor_parcelado: p.valorParcelado === "" || p.valorParcelado == null ? null : toMoney(p.valorParcelado),
    percentual_lucro: p.percentualLucro === "" || p.percentualLucro == null ? null : toMoney(p.percentualLucro),
    qtd_minima: toInt(p.quantidadeMinima),
    garantia: toInt(p.garantia),            // backend formata "X meses"
    qtd_inicial: toInt(p.quantidadeInicial),
  };
}

const money = (n) => `R$ ${Number(n || 0).toFixed(2)}`;

/**
 * Tela de estoque reutilizável (Baterias e Som compartilham o mesmo layout).
 * Diferenças via props: título, ícone, descrição, API, coluna de lucro e coluna Modelo.
 */
export default function EstoqueView({
  title,
  description,
  icon: Icon,
  api,
  movApi,
  showModelo = false,
  lucroVariant = "percent", // 'percent' (% Lucro) | 'valor' (Lucro R$)
  linha = "BATERIAS", // BATERIAS | SOM — linha do inventário
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [inventarioOpen, setInventarioOpen] = useState(false);

  const [role] = useState(() => localStorage.getItem("role") || "admin");
  const [linhas, setLinhas] = useState([]);
  const [filtro, setFiltro] = useState(() => localStorage.getItem("estoqueFilter") || "");
  const [criticos, setCriticos] = useState(false);

  const [sortBy, setSortBy] = useState({ key: "nome", dir: "asc" });

  const [editOpen, setEditOpen] = useState(false);
  const [produtoEdit, setProdutoEdit] = useState(null);
  const [editVistaManual, setEditVistaManual] = useState(false);
  const [editParceladoManual, setEditParceladoManual] = useState(false);

  // modal de movimentação
  const [movOpen, setMovOpen] = useState(false);
  const [mov, setMov] = useState({ produtoId: null, tipo: "entrada", quantidade: 0, valor_final: "" });

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const carregar = useCallback(async (q = "") => {
    setLoading(true); setErrorMsg("");
    try {
      const data = await api.listar({ q });
      setLinhas(data.map(mapDbToUi));
    } catch (e) {
      console.error("GET /estoque ERRO →", e);
      setErrorMsg(e?.response?.data?.message || e?.message || "Falha ao carregar estoque");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { carregar(""); }, [carregar]);

  useEffect(() => {
    localStorage.setItem("estoqueFilter", filtro);
    const t = setTimeout(() => carregar(filtro), 300);
    return () => clearTimeout(t);
  }, [filtro, carregar]);

  const filtered = useMemo(() => {
    const f = (filtro ?? "").toLowerCase();
    return (linhas ?? []).filter((p) => {
      const okBusca = p.nome.toLowerCase().includes(f) || p.modelo.toLowerCase().includes(f);
      const okCritico = criticos ? Number(p.emEstoque || 0) <= Number(p.quantidadeMinima || 0) : true;
      return okBusca && okCritico;
    });
  }, [linhas, filtro, criticos]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sortBy || {};
    arr.sort((a, b) => {
      const va = a?.[key]; const vb = b?.[key];
      if (typeof va === "number" && typeof vb === "number") return dir === "asc" ? va - vb : vb - va;
      const sa = String(va ?? "").toLowerCase(); const sb = String(vb ?? "").toLowerCase();
      if (sa < sb) return dir === "asc" ? -1 : 1;
      if (sa > sb) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortBy]);

  function toggleSort(key) {
    setSortBy((prev) => (!prev || prev.key !== key ? { key, dir: "asc" } : { key, dir: prev.dir === "asc" ? "desc" : "asc" }));
  }

  async function handleDelete(id) {
    if (!id) return;
    const ok = await confirm({
      title: "Confirmar exclusão",
      message: "Esta ação não pode ser desfeita. Deseja continuar?",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    try {
      await api.remover(id);
      setLinhas(prev => prev.filter(x => String(x.id) !== String(id)));
      toast.success("Produto removido do estoque.");
    } catch (e) {
      console.error("DELETE /estoque erro:", e);
      toast.error(e?.response?.data?.message || "Não foi possível remover. Verifique se há movimentações vinculadas.");
    }
  }

  function openEdit(prod) {
    setProdutoEdit({
      id: prod?.id,
      nome: prod?.nome ?? "",
      modelo: prod?.modelo ?? "",
      custo: prod?.custo ?? 0,
      valorVenda: prod?.valorVenda ?? 0,
      percentualLucro: prod?.percentualLucro ?? "",
      valorVista: prod?.valorVista ?? "",
      valorParcelado: prod?.valorParcelado ?? "",
      quantidadeMinima: prod?.quantidadeMinima ?? 0,
      garantia: garantiaToNumber(prod?.garantia),
      quantidadeInicial: prod?.quantidadeInicial ?? 0,
    });
    setEditVistaManual(false);
    setEditParceladoManual(false);
    setEditOpen(true);
  }

  // Recalcula preços ao alterar custo ou % lucro (respeitando edição manual).
  function editCustoLucro(name, value) {
    setProdutoEdit((prev) => {
      const next = { ...prev, [name]: value };
      const temBase = next.custo !== "" && Number(next.custo) > 0;
      const precos = calcularPrecos(next.custo, next.percentualLucro);
      if (!editVistaManual) next.valorVista = temBase ? String(precos.valor_vista) : "";
      if (!editParceladoManual) next.valorParcelado = temBase ? String(precos.valor_parcelado) : "";
      return next;
    });
  }

  function editRecalcular(campo) {
    if (campo === "vista") setEditVistaManual(false);
    else setEditParceladoManual(false);
    setProdutoEdit((prev) => {
      const temBase = prev.custo !== "" && Number(prev.custo) > 0;
      const precos = calcularPrecos(prev.custo, prev.percentualLucro);
      if (campo === "vista") return { ...prev, valorVista: temBase ? String(precos.valor_vista) : "" };
      return { ...prev, valorParcelado: temBase ? String(precos.valor_parcelado) : "" };
    });
  }

  function openMov(row, tipo) {
    setMov({ produtoId: row.id, tipo, quantidade: 1, valor_final: "" });
    setMovOpen(true);
  }

  async function saveMov() {
    const q = parseInt(mov.quantidade, 10);
    if (!mov.produtoId || !["entrada", "saida"].includes(mov.tipo) || !Number.isFinite(q) || q <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    try {
      await movApi.criar({
        produto_id: mov.produtoId,
        tipo: mov.tipo,
        quantidade: q,
        valor_final: mov.valor_final,
      });

      // atualiza linha localmente (otimista)
      setLinhas((prev) =>
        prev.map((x) => {
          if (x.id !== mov.produtoId) return x;
          if (mov.tipo === "entrada") {
            const entradas = x.entradas + q;
            const emEstoque = x.quantidadeInicial + entradas - x.saidas;
            return { ...x, entradas, emEstoque };
          } else {
            const saidas = x.saidas + q;
            const emEstoque = x.quantidadeInicial + x.entradas - saidas;
            return { ...x, saidas, emEstoque };
          }
        })
      );

      setMovOpen(false);
    } catch (e) {
      console.error("POST /movimentacoes ERRO:", e);
      toast.error(e?.response?.data?.message || "Falha ao registrar movimentação");
    }
  }

  async function saveEdit() {
    const p = produtoEdit || {};
    if (!p.nome?.trim() || !p.modelo?.trim()) {
      toast.error('Preencha "Produto" e "Modelo".');
      return;
    }

    const normalized = {
      ...p,
      custo: Number(p?.custo) || 0,
      valorVenda: Number(p?.valorVenda) || 0,
      percentualLucro: p?.percentualLucro,
      valorVista: p?.valorVista,
      valorParcelado: p?.valorParcelado,
      quantidadeMinima: parseInt(p?.quantidadeMinima, 10) || 0,
      garantia: parseInt(p?.garantia, 10) || 0,
      quantidadeInicial: parseInt(p?.quantidadeInicial, 10) || 0,
    };

    try {
      if (p.id) {
        const payload = mapUiToDb(normalized);
        const updated = await api.atualizar(p.id, payload);
        const ui = mapDbToUi(updated);
        setLinhas((prev) => prev.map((x) => (x.id === ui.id ? ui : x)));
      } else {
        const payload = mapUiToDb(normalized);
        const created = await api.criar(payload);
        const ui = mapDbToUi(created);
        setLinhas((prev) => [ui, ...prev]);
      }
      setEditOpen(false);
      toast.success(p.id ? "Produto atualizado." : "Produto criado.");
    } catch (e) {
      console.error("Salvar produto erro:", e);
      toast.error(e?.response?.data?.message || e?.message || "Falha ao salvar");
    }
  }

  // ===== definição de colunas (dinâmica) =====
  const lucroColor = (n) => (n > 0 ? "text-emerald-600" : n < 0 ? "text-rose-600" : "text-slate-500");

  const columns = useMemo(() => {
    const cols = [{ key: "nome", label: "Produto", sortable: true, width: "w-[14%]", render: (r) => r.nome }];
    if (showModelo) cols.push({ key: "modelo", label: "Modelo", sortable: true, width: "w-[10%]", render: (r) => r.modelo });

    if (role === "admin") {
      cols.push({ key: "custo", label: "Custo", sortable: true, render: (r) => money(r.custo) });
      cols.push({ key: "valorVista", label: "À Vista", sortable: true, render: (r) => (r.valorVista != null ? money(r.valorVista) : "—") });
      cols.push({ key: "valorParcelado", label: "Parcelado", sortable: true, render: (r) => (r.valorParcelado != null ? money(r.valorParcelado) : "—") });
      if (lucroVariant === "valor") {
        cols.push({
          key: "lucro", label: "Lucro (R$)", sortable: true,
          render: (r) => { const l = Number(r.valorVenda || 0) - Number(r.custo || 0); return <span className={`font-semibold ${lucroColor(l)}`}>{money(l)}</span>; },
        });
      } else {
        cols.push({
          key: "percent", label: "% Lucro", sortable: true,
          render: (r) => { const p = r.custo > 0 ? ((r.valorVenda - r.custo) / r.custo) * 100 : 0; return <span className={`font-semibold ${lucroColor(p)}`}>{p.toFixed(2)}%</span>; },
        });
      }
    } else {
      cols.push({ key: "valorVista", label: "À Vista", sortable: true, render: (r) => (r.valorVista != null ? money(r.valorVista) : "—") });
      cols.push({ key: "valorParcelado", label: "Parcelado", sortable: true, render: (r) => (r.valorParcelado != null ? money(r.valorParcelado) : "—") });
    }

    cols.push({ key: "quantidadeMinima", label: "Qtd Mínima", sortable: true, render: (r) => r.quantidadeMinima });
    cols.push({ key: "garantia", label: "Garantia", sortable: true, render: (r) => r.garantia });
    cols.push({ key: "quantidadeInicial", label: "Qtd Inicial", sortable: true, render: (r) => r.quantidadeInicial });
    cols.push({ key: "entradas", label: "Entradas", sortable: true, render: (r) => r.entradas });
    cols.push({ key: "saidas", label: "Saídas", sortable: true, render: (r) => r.saidas });
    cols.push({
      key: "emEstoque", label: "Em Estoque", sortable: true,
      render: (r) => {
        const ok = Number(r.emEstoque) > Number(r.quantidadeMinima);
        return (
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {r.emEstoque}
          </span>
        );
      },
    });
    cols.push({ key: "acoes", label: "Ações", sortable: false, width: "w-[11%]", render: null });
    return cols;
  }, [role, showModelo, lucroVariant]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
            {Icon && <Icon size={24} strokeWidth={2.2} />}
          </span>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">{title}</h1>
            <p className="text-sm text-slate-500">{description}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setInventarioOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-400 bg-transparent px-4 py-2.5 font-semibold text-amber-600 transition-colors hover:bg-amber-50"
          >
            <ClipboardList size={18} strokeWidth={2.2} />
            Inventário
          </button>
          <button
            onClick={() => navigate("/cadastro")}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500"
          >
            <Plus size={18} strokeWidth={2.5} />
            Adicionar Produto
          </button>
        </div>
      </div>

      {inventarioOpen && (
        <Inventario linha={linha} onClose={() => setInventarioOpen(false)} />
      )}

      {/* Search & filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Buscar por produto ou modelo..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </div>

          <button
            type="button"
            onClick={() => setCriticos((v) => !v)}
            aria-pressed={criticos}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              criticos
                ? "bg-amber-400 text-slate-900 shadow-sm"
                : "border border-slate-300 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50"
            }`}
          >
            Só críticos
          </button>
      </div>

      {errorMsg && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}
      {loading && <div className="mt-4 text-sm text-slate-400">Carregando…</div>}

      {/* Table */}
      <div className="mt-5 overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-slate-800">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => c.sortable && toggleSort(c.key)}
                    title={c.sortable ? "Clique para ordenar" : undefined}
                    className={`px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-white ${c.width ?? ""} ${
                      c.sortable ? "cursor-pointer select-none hover:bg-slate-700 transition-colors" : ""
                    }`}
                  >
                    {c.label}
                    {sortBy.key === c.key ? (
                      sortBy.dir === "asc"
                        ? <ChevronUp size={13} className="inline ml-1 opacity-80" />
                        : <ChevronDown size={13} className="inline ml-1 opacity-80" />
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => (
                <tr key={r.id ?? idx} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60 transition-colors hover:bg-amber-50/50">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-2 py-2 text-xs text-slate-700 ${c.key === "acoes" ? "whitespace-nowrap" : ""}`}>
                      {c.key === "acoes" ? (
                        <div className="flex items-center gap-1">
                          <IconBtn title="Editar" onClick={() => openEdit(r)} className="hover:bg-amber-50 hover:text-amber-600"><Pencil size={16} /></IconBtn>
                          <IconBtn title="Entrada" onClick={() => openMov(r, "entrada")} className="hover:bg-emerald-50 hover:text-emerald-600"><ArrowUp size={16} /></IconBtn>
                          <IconBtn title="Saída" onClick={() => openMov(r, "saida")} className="hover:bg-sky-50 hover:text-sky-600"><ArrowDown size={16} /></IconBtn>
                          <IconBtn title="Remover" onClick={() => handleDelete(r.id)} className="hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></IconBtn>
                        </div>
                      ) : (
                        c.render(r)
                      )}
                    </td>
                  ))}
                </tr>
              ))}

              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <PackageOpen size={44} strokeWidth={1.4} className="text-slate-300" />
                      <p className="text-sm font-medium text-slate-500">Nenhum produto cadastrado ainda.</p>
                      <button
                        onClick={() => navigate("/cadastro")}
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                      >
                        <Plus size={16} strokeWidth={2.5} />
                        Adicionar primeiro produto
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Modal Editar produto */}
      {editOpen && (
        <Modal onClose={() => setEditOpen(false)} title="Editar Produto">
          {[
            { key: "nome", label: "Produto", type: "text" },
            { key: "modelo", label: "Modelo", type: "text" },
          ].map(({ key, label, type }) => (
            <div key={key} className="mb-3">
              <label className="mb-1 block text-sm text-slate-600">{label}</label>
              <input
                type={type}
                value={produtoEdit?.[key] ?? ""}
                onChange={(e) => setProdutoEdit((prev) => ({ ...prev, [key]: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
            </div>
          ))}

          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">Custo</label>
              <input
                type="number" step="0.01" min="0" value={produtoEdit?.custo ?? ""}
                onChange={(e) => editCustoLucro("custo", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">% Lucro</label>
              <input
                type="number" step="0.01" min="0" value={produtoEdit?.percentualLucro ?? ""}
                onChange={(e) => editCustoLucro("percentualLucro", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
            </div>
          </div>

          <EditPriceField
            label="Valor à vista (PIX/Dinheiro/Débito)"
            value={produtoEdit?.valorVista ?? ""}
            onChange={(e) => { setEditVistaManual(true); setProdutoEdit((prev) => ({ ...prev, valorVista: e.target.value })); }}
            onRecalcular={() => editRecalcular("vista")}
          />
          <EditPriceField
            label="Valor parcelado (10x)"
            value={produtoEdit?.valorParcelado ?? ""}
            onChange={(e) => { setEditParceladoManual(true); setProdutoEdit((prev) => ({ ...prev, valorParcelado: e.target.value })); }}
            onRecalcular={() => editRecalcular("parcelado")}
          />

          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "quantidadeMinima", label: "Qtd Mínima" },
              { key: "garantia", label: "Garantia" },
              { key: "quantidadeInicial", label: "Qtd Inicial" },
            ].map(({ key, label }) => (
              <div key={key} className="mb-3">
                <label className="mb-1 block text-sm text-slate-600">{label}</label>
                <input
                  type="number"
                  value={produtoEdit?.[key] ?? ""}
                  onChange={(e) => setProdutoEdit((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                />
              </div>
            ))}
          </div>

          <ModalActions onCancel={() => setEditOpen(false)} onSave={saveEdit} />
        </Modal>
      )}

      {/* Modal Movimentação */}
      {movOpen && (
        <Modal onClose={() => setMovOpen(false)} title={`Registrar ${mov.tipo === "entrada" ? "Entrada" : "Saída"}`}>
          <div className="mb-3">
            <label className="mb-1 block text-sm text-slate-600">Quantidade *</label>
            <input
              type="number" min="1" value={mov.quantidade}
              onChange={(e) => setMov((prev) => ({ ...prev, quantidade: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-sm text-slate-600">Valor total (opcional)</label>
            <input
              type="number" step="0.01" value={mov.valor_final}
              onChange={(e) => setMov((prev) => ({ ...prev, valor_final: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </div>
          <ModalActions onCancel={() => setMovOpen(false)} onSave={saveMov} />
        </Modal>
      )}
    </div>
  );
}

/* ---------- subcomponentes de UI ---------- */

function IconBtn({ title, onClick, className = "", children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

// Campo de preço calculado (editável) com botão "Recalcular".
function EditPriceField({ label, value, onChange, onRecalcular }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-sm text-slate-600">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Calculator size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" />
          <input
            type="number" step="0.01" min="0" value={value} onChange={onChange}
            placeholder="0,00"
            className="w-full rounded-lg border border-amber-200 bg-amber-50 py-2 pl-9 pr-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
        </div>
        <button
          type="button"
          onClick={onRecalcular}
          title="Recalcular valor automático"
          className="flex items-center rounded-lg border border-amber-300 bg-white px-3 text-amber-600 transition-colors hover:bg-amber-50"
        >
          <RotateCcw size={15} />
        </button>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[1999] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-[min(460px,92vw)] rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-slate-800">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, onSave }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-50">
        Cancelar
      </button>
      <button onClick={onSave} className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-slate-900 transition-colors hover:bg-amber-500">
        Salvar
      </button>
    </div>
  );
}
