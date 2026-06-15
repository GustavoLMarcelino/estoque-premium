import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ClipboardList, Search, Battery, Music, Plus, PackageOpen,
  Pencil, ArrowUp, ArrowDown, Trash2, ChevronUp, ChevronDown,
} from "lucide-react";
import { EstoqueAPI } from "../../services/estoque";
import { MovAPI } from "../../services/movimentacoes";
import { EstoqueSomAPI } from "../../services/estoqueSom";
import { MovSomAPI } from "../../services/movimentacoesSom";
import { ESTOQUE_TIPOS } from "../../services/estoqueTipos";

const PAGAMENTO_KEY = "movPagamentos";

function mapDbToUi(row) {
  const custo = Number(row?.custo ?? 0);
  const valorVenda = Number(row?.valor_venda ?? 0);
  return {
    id: row.id,
    nome: row?.produto ?? "",
    modelo: row?.modelo ?? "",
    custo,
    valorVenda,
    quantidadeMinima: Number(row?.qtd_minima ?? 0),
    garantia: row?.garantia ?? "",
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
  return {
    produto: p.nome,
    modelo: p.modelo,
    custo: toMoney(p.custo),
    valor_venda: toMoney(p.valorVenda),
    qtd_minima: toInt(p.quantidadeMinima),
    garantia: toInt(p.garantia),
    qtd_inicial: toInt(p.quantidadeInicial),
  };
}

export default function RegistroMovimentacoes() {
  const [role] = useState(() => localStorage.getItem("role") || "admin");
  const [linhas, setLinhas] = useState([]);
  const [filtro, setFiltro] = useState(() => localStorage.getItem("estoqueFilter") || "");
  const [criticos, setCriticos] = useState(false);
  const [tipoEstoque, setTipoEstoque] = useState(ESTOQUE_TIPOS.BATERIAS);
  const [sortBy, setSortBy] = useState({ field: "nome", dir: "asc" });
  const [editOpen, setEditOpen] = useState(false);
  const [produtoEdit, setProdutoEdit] = useState(null);
  const [movOpen, setMovOpen] = useState(false);
  const [mov, setMov] = useState({
    produtoId: null,
    tipo: "entrada",
    quantidade: 0,
    valor_final: "",
    formaPagamento: "",
    parcelas: 1,
  });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const carregar = useCallback(async (q = "") => {
    setLoading(true); setErrorMsg("");
    try {
      const service = tipoEstoque === ESTOQUE_TIPOS.SOM ? EstoqueSomAPI : EstoqueAPI;
      const data = await service.listar({ q });
      setLinhas((data || []).map(mapDbToUi));
    } catch (e) {
      console.error("GET /estoque ERRO:", e);
      setErrorMsg(e?.response?.data?.message || e?.message || "Falha ao carregar estoque");
    } finally {
      setLoading(false);
    }
  }, [tipoEstoque]);

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
    const { field, dir } = sortBy || {};
    arr.sort((a, b) => {
      const va = a?.[field]; const vb = b?.[field];
      if (typeof va === "number" && typeof vb === "number") return dir === "asc" ? va - vb : vb - va;
      const sa = String(va ?? "").toLowerCase(); const sb = String(vb ?? "").toLowerCase();
      if (sa < sb) return dir === "asc" ? -1 : 1;
      if (sa > sb) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortBy]);

  function toggleSort(nextField) {
    setSortBy((prev) => (
      !prev || prev.field !== nextField
        ? { field: nextField, dir: "asc" }
        : { field: nextField, dir: prev.dir === "asc" ? "desc" : "asc" }
    ));
  }

  async function handleDelete(id) {
    if (!id) return;
    const ok = window.confirm("Deseja remover este produto do estoque?");
    if (!ok) return;
    try {
      const service = tipoEstoque === ESTOQUE_TIPOS.SOM ? EstoqueSomAPI : EstoqueAPI;
      await service.remover(id);
      setLinhas((prev) => prev.filter((x) => String(x.id) !== String(id)));
    } catch (e) {
      console.error("DELETE /estoque erro:", e);
      alert(e?.response?.data?.message || "Nao foi possivel remover. Verifique se ha movimentacoes vinculadas.");
    }
  }

  function openEdit(prod) {
    setProdutoEdit({
      id: prod?.id,
      nome: prod?.nome ?? "",
      modelo: prod?.modelo ?? "",
      custo: prod?.custo ?? 0,
      valorVenda: prod?.valorVenda ?? 0,
      quantidadeMinima: prod?.quantidadeMinima ?? 0,
      garantia: Number(prod?.garantia ?? 0),
      quantidadeInicial: prod?.quantidadeInicial ?? 0,
    });
    setEditOpen(true);
  }

  function openNew() {
    setProdutoEdit({ id: null, nome: "", modelo: "", custo: 0, valorVenda: 0, quantidadeMinima: 0, garantia: 0, quantidadeInicial: 0 });
    setEditOpen(true);
  }

  function openMov(prod, tipo) {
    setMov({
      produtoId: prod.id,
      tipo,
      quantidade: 0,
      valor_final: "",
      formaPagamento: "",
      parcelas: 1,
    });
    setMovOpen(true);
  }

  async function saveMov() {
    const q = parseInt(mov.quantidade, 10);
    if (!mov.produtoId || !["entrada", "saida"].includes(mov.tipo) || !Number.isFinite(q) || q <= 0) {
      alert("Informe uma quantidade valida.");
      return;
    }
    if (mov.tipo === "saida" && !mov.formaPagamento) {
      alert("Informe a forma de pagamento.");
      return;
    }

    try {
      const movService = tipoEstoque === ESTOQUE_TIPOS.SOM ? MovSomAPI : MovAPI;
      const created = await movService.criar({
        produto_id: mov.produtoId,
        tipo: mov.tipo,
        quantidade: q,
        valor_final: mov.valor_final,
      });

      if (mov.tipo === "saida" && created?.id) {
        const parcelas = Math.max(1, parseInt(mov.parcelas, 10) || 1);
        try {
          const raw = localStorage.getItem(PAGAMENTO_KEY) || "{}";
          const store = JSON.parse(raw);
          store[String(created.id)] = {
            forma: mov.formaPagamento,
            parcelas: mov.formaPagamento === "credito" ? parcelas : 1,
            unit: Number(mov.valor_final) || 0,
          };
          localStorage.setItem(PAGAMENTO_KEY, JSON.stringify(store));
        } catch (err) {
          console.error("Falha ao salvar metadados de pagamento:", err);
        }
      }

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
      alert(e?.response?.data?.message || "Falha ao registrar movimentacao");
    }
  }

  async function saveEdit() {
    const p = produtoEdit || {};
    if (!p.nome?.trim() || !p.modelo?.trim()) {
      alert('Preencha "Produto" e "Modelo".');
      return;
    }

    const normalized = {
      ...p,
      custo: Number(p?.custo) || 0,
      valorVenda: Number(p?.valorVenda) || 0,
      quantidadeMinima: parseInt(p?.quantidadeMinima, 10) || 0,
      garantia: parseInt(p?.garantia, 10) || 0,
      quantidadeInicial: parseInt(p?.quantidadeInicial, 10) || 0,
    };

    try {
      const service = tipoEstoque === ESTOQUE_TIPOS.SOM ? EstoqueSomAPI : EstoqueAPI;
      if (p.id) {
        const payload = mapUiToDb(normalized);
        const updated = await service.atualizar(p.id, payload);
        const ui = mapDbToUi(updated);
        setLinhas((prev) => prev.map((x) => (x.id === ui.id ? ui : x)));
      } else {
        const payload = mapUiToDb(normalized);
        const created = await service.criar(payload);
        const ui = mapDbToUi(created);
        setLinhas((prev) => [ui, ...prev]);
      }
      setEditOpen(false);
    } catch (e) {
      console.error("Salvar produto erro:", e);
      alert(e?.response?.data?.message || e?.message || "Falha ao salvar");
    }
  }

  function SortIcon({ field }) {
    if (sortBy.field !== field) return null;
    return sortBy.dir === "asc"
      ? <ChevronUp size={13} className="inline ml-1 opacity-80" />
      : <ChevronDown size={13} className="inline ml-1 opacity-80" />;
  }

  function thClass(sortable) {
    return `px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white whitespace-nowrap${sortable ? " cursor-pointer select-none hover:bg-slate-700 transition-colors" : ""}`;
  }

  const adminColCount = role === "admin" ? 13 : 11;

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
              <p className="text-sm text-slate-500">Acompanhe todas as movimentações do estoque</p>
            </div>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500"
          >
            <Plus size={16} strokeWidth={2.5} />
            Novo Produto
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Buscar produto ou modelo..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </div>

          {/* Só críticos toggle */}
          <button
            type="button"
            onClick={() => setCriticos((v) => !v)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              criticos
                ? "bg-amber-400 text-slate-900 shadow-sm"
                : "border border-slate-300 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50"
            }`}
          >
            Só críticos
          </button>

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

        {loading && (
          <p className="mt-3 text-sm text-slate-400">Carregando...</p>
        )}

        {/* Table */}
        <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-800">
                  <th className={thClass(true)} onClick={() => toggleSort("nome")}>
                    Produto <SortIcon field="nome" />
                  </th>
                  <th className={thClass(true)} onClick={() => toggleSort("modelo")}>
                    Modelo <SortIcon field="modelo" />
                  </th>
                  {role === "admin" && (
                    <>
                      <th className={thClass(true)} onClick={() => toggleSort("custo")}>
                        Custo <SortIcon field="custo" />
                      </th>
                      <th className={thClass(true)} onClick={() => toggleSort("valorVenda")}>
                        Valor Venda <SortIcon field="valorVenda" />
                      </th>
                      <th className={thClass(true)} onClick={() => toggleSort("percent")}>
                        % Lucro <SortIcon field="percent" />
                      </th>
                    </>
                  )}
                  {role !== "admin" && (
                    <th className={thClass(true)} onClick={() => toggleSort("valorVenda")}>
                      Valor Venda <SortIcon field="valorVenda" />
                    </th>
                  )}
                  <th className={thClass(true)} onClick={() => toggleSort("quantidadeMinima")}>
                    Qtd Mínima <SortIcon field="quantidadeMinima" />
                  </th>
                  <th className={thClass(true)} onClick={() => toggleSort("garantia")}>
                    Garantia <SortIcon field="garantia" />
                  </th>
                  <th className={thClass(false)}>Estoque</th>
                  <th className={thClass(true)} onClick={() => toggleSort("quantidadeInicial")}>
                    Qtd Inicial <SortIcon field="quantidadeInicial" />
                  </th>
                  <th className={thClass(true)} onClick={() => toggleSort("entradas")}>
                    Entradas <SortIcon field="entradas" />
                  </th>
                  <th className={thClass(true)} onClick={() => toggleSort("saidas")}>
                    Saídas <SortIcon field="saidas" />
                  </th>
                  <th className={thClass(true)} onClick={() => toggleSort("emEstoque")}>
                    Em Estoque <SortIcon field="emEstoque" />
                  </th>
                  <th className={thClass(false)}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, idx) => {
                  const percent = r.custo > 0 ? ((r.valorVenda - r.custo) / r.custo) * 100 : 0;

                  let stockBadge;
                  if (r.emEstoque <= 0) {
                    stockBadge = "inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700";
                  } else if (r.emEstoque <= r.quantidadeMinima) {
                    stockBadge = "inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700";
                  } else {
                    stockBadge = "inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700";
                  }

                  const tdBase = "px-3 py-3 whitespace-nowrap text-slate-700";

                  return (
                    <tr
                      key={r.id ?? idx}
                      className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60 transition-colors hover:bg-amber-50/40"
                    >
                      <td className={`${tdBase} font-semibold text-slate-800`}>{r.nome}</td>
                      <td className={tdBase}>{r.modelo}</td>
                      {role === "admin" && (
                        <>
                          <td className={tdBase}>R$ {Number(r.custo || 0).toFixed(2)}</td>
                          <td className={tdBase}>R$ {Number(r.valorVenda || 0).toFixed(2)}</td>
                          <td className={`${tdBase} font-semibold text-emerald-600`}>{percent.toFixed(2)}%</td>
                        </>
                      )}
                      {role !== "admin" && (
                        <td className={tdBase}>R$ {Number(r.valorVenda || 0).toFixed(2)}</td>
                      )}
                      <td className={tdBase}>{r.quantidadeMinima}</td>
                      <td className={tdBase}>{r.garantia}</td>
                      <td className={tdBase}>{tipoEstoque === ESTOQUE_TIPOS.SOM ? "Som" : "Baterias"}</td>
                      <td className={tdBase}>{r.quantidadeInicial}</td>
                      <td className={`${tdBase} font-semibold text-emerald-600`}>{r.entradas}</td>
                      <td className={`${tdBase} font-semibold text-red-500`}>{r.saidas}</td>
                      <td className={tdBase}>
                        <span className={stockBadge}>{r.emEstoque}</span>
                      </td>
                      <td className={tdBase}>
                        <div className="flex items-center gap-1">
                          <ActionBtn
                            title="Editar"
                            onClick={() => openEdit(r)}
                            className="text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          >
                            <Pencil size={15} />
                          </ActionBtn>
                          <ActionBtn
                            title="Registrar entrada"
                            onClick={() => openMov(r, "entrada")}
                            className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <ArrowUp size={15} />
                          </ActionBtn>
                          <ActionBtn
                            title="Registrar saída"
                            onClick={() => openMov(r, "saida")}
                            className="text-red-500 hover:bg-red-50 hover:text-red-600"
                          >
                            <ArrowDown size={15} />
                          </ActionBtn>
                          <ActionBtn
                            title="Remover"
                            onClick={() => handleDelete(r.id)}
                            className="text-red-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!loading && sorted.length === 0 && (
                  <tr>
                    <td colSpan={adminColCount} className="px-4 py-16">
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
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEditOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-5 text-lg font-bold text-slate-800">
              {produtoEdit?.id ? "Editar Produto" : "Novo Produto"}
            </h3>

            <div className="space-y-3">
              {[
                { key: "nome", label: "Produto *", type: "text" },
                { key: "modelo", label: "Modelo *", type: "text" },
                { key: "custo", label: "Custo", type: "number" },
                { key: "valorVenda", label: "Valor de Venda", type: "number" },
                { key: "quantidadeMinima", label: "Qtd Mínima", type: "number" },
                { key: "garantia", label: "Garantia (meses)", type: "number" },
                { key: "quantidadeInicial", label: "Qtd Inicial", type: "number" },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
                  <input
                    type={type}
                    value={produtoEdit?.[key] ?? ""}
                    onChange={(e) => setProdutoEdit((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                  />
                </div>
              ))}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setEditOpen(false)}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                className="flex-1 rounded-lg bg-amber-400 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-500"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Movimento Modal */}
      {movOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setMovOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`mb-5 text-lg font-bold ${mov.tipo === "entrada" ? "text-emerald-700" : "text-red-600"}`}>
              Registrar {mov.tipo === "entrada" ? "Entrada" : "Saída"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Quantidade *</label>
                <input
                  type="number"
                  min="1"
                  value={mov.quantidade}
                  onChange={(e) => setMov((prev) => ({ ...prev, quantidade: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Valor unitário final (opcional)</label>
                <input
                  type="number"
                  step="0.01"
                  value={mov.valor_final}
                  onChange={(e) => setMov((prev) => ({ ...prev, valor_final: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                />
              </div>

              {mov.tipo === "saida" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Forma de pagamento *</label>
                    <select
                      value={mov.formaPagamento}
                      onChange={(e) =>
                        setMov((prev) => ({
                          ...prev,
                          formaPagamento: e.target.value,
                          parcelas: e.target.value === "credito" ? prev.parcelas : 1,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                    >
                      <option value="">Selecione...</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="pix">Pix</option>
                      <option value="debito">Debito</option>
                      <option value="credito">Credito</option>
                    </select>
                  </div>

                  {mov.formaPagamento === "credito" && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Parcelas</label>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={mov.parcelas}
                        onChange={(e) => {
                          const value = parseInt(e.target.value || "1", 10);
                          const normalized = Number.isFinite(value) ? Math.max(1, value) : 1;
                          setMov((prev) => ({ ...prev, parcelas: normalized }));
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setMovOpen(false)}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveMov}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                  mov.tipo === "entrada"
                    ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : "bg-red-500 text-white hover:bg-red-600"
                }`}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({ onClick, title, className, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${className}`}
    >
      {children}
    </button>
  );
}
