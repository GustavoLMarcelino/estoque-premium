import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { EstoqueAPI } from "../../services/estoque";
import { MovAPI } from "../../services/movimentacoes";

// estilos
const td = { border: "1px solid #ccc", padding: 8, whiteSpace: "nowrap" };
const btn = { padding: "8px 12px", border: "1px solid #ccc", background: "#f7f7f7", cursor: "pointer" };
const btnPrimary = { ...btn, background: "#1976d2", color: "#fff", borderColor: "#1976d2" };
const backdrop = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modal = { background: "#fff", width: "min(420px, 92vw)", borderRadius: 8, padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.2)" };

// mini estilos do dropdown
const actionWrap = { position: "relative", display: "inline-block" };
const actionBtn = { ...btn, padding: "6px 10px" };
const menu = {
  position: "absolute", top: "110%", right: 0, minWidth: 160,
  background: "#fff", border: "1px solid #ccc", borderRadius: 6, boxShadow: "0 10px 20px rgba(0,0,0,.12)", zIndex: 5
};
const menuItem = {
  display: "block", width: "100%", textAlign: "left",
  padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer"
};
const menuItemDanger = { ...menuItem, color: "#c62828", fontWeight: 600 };

/* garantia helpers */
function formatGarantia(v) {
  if (v === null || v === undefined || v === "") return "0 meses";
  const s = String(v).trim();
  if (s.toLowerCase().includes("mes")) return s;
  const m = s.match(/\d+/);
  return m ? `${parseInt(m[0], 10)} meses` : "0 meses";
}
function garantiaToNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  const m = String(v).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

/* mapping */
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
    garantia: formatGarantia(row?.garantia),
    quantidadeInicial: Number(row?.qtd_inicial ?? 0),
    entradas: Number(row?.entradas ?? 0),
    saidas: Number(row?.saidas ?? 0),
    emEstoque: Number(row?.em_estoque ?? (Number(row?.qtd_inicial ?? 0) + Number(row?.entradas ?? 0) - Number(row?.saidas ?? 0))),
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
    garantia: toInt(p.garantia),        // backend formata "X meses"
    qtd_inicial: toInt(p.quantidadeInicial),
  };
}

export default function Estoque() {
  const [role] = useState(() => localStorage.getItem("role") || "admin");
  const [linhas, setLinhas] = useState([]);
  const [filtro, setFiltro] = useState(() => localStorage.getItem("estoqueFilter") || "");
  const [criticos, setCriticos] = useState(false);

  const [sortBy, setSortBy] = useState({ key: "nome", dir: "asc" });
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [editOpen, setEditOpen] = useState(false);
  const [produtoEdit, setProdutoEdit] = useState(null);

  // modal de movimentação
  const [movOpen, setMovOpen] = useState(false);
  const [mov, setMov] = useState({ produtoId: null, tipo: "entrada", quantidade: 0, valor_final: "" });

  // dropdown de ações
  const [openMenuFor, setOpenMenuFor] = useState(null);
  const tableRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const carregar = useCallback(async (q = "") => {
    setLoading(true); setErrorMsg("");
    try {
      const data = await EstoqueAPI.listar({ q });
      setLinhas(data.map(mapDbToUi));
    } catch (e) {
      console.error("GET /estoque ERRO →", e);
      setErrorMsg(e?.response?.data?.message || e?.message || "Falha ao carregar estoque");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(""); }, [carregar]);

  useEffect(() => {
    localStorage.setItem("estoqueFilter", filtro);
    const t = setTimeout(() => carregar(filtro), 300);
    return () => clearTimeout(t);
  }, [filtro, carregar]);

  // fecha o menu ao clicar fora
  useEffect(() => {
    function handleClick(e) {
      if (!tableRef.current) return;
      if (!tableRef.current.contains(e.target)) setOpenMenuFor(null);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

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

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(() => sorted.slice((currentPage - 1) * pageSize, (currentPage) * pageSize), [sorted, currentPage]);

  function toggleSort(key) {
    setSortBy((prev) => (!prev || prev.key !== key ? { key, dir: "asc" } : { key, dir: prev.dir === "asc" ? "desc" : "asc" }));
  }

  async function handleDelete(id) {
    if (!id) return;
    const ok = window.confirm("Deseja remover este produto do estoque?");
    if (!ok) return;
    try {
      await EstoqueAPI.remover(id);
      setLinhas(prev => prev.filter(x => String(x.id) !== String(id)));
    } catch (e) {
      console.error("DELETE /estoque erro:", e);
      alert(e?.response?.data?.message || "Não foi possível remover. Verifique se há movimentações vinculadas.");
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
      garantia: garantiaToNumber(prod?.garantia),
      quantidadeInicial: prod?.quantidadeInicial ?? 0,
    });
    setEditOpen(true);
  }

  function openNew() {
    setProdutoEdit({ id: null, nome: "", modelo: "", custo: 0, valorVenda: 0, quantidadeMinima: 0, garantia: 0, quantidadeInicial: 0 });
    setEditOpen(true);
  }

  // abrir modal de movimentação
  function openMov(row, tipo) {
    setMov({ produtoId: row.id, tipo, quantidade: 1, valor_final: "" });
    setMovOpen(true);
  }

  async function saveMov() {
    const q = parseInt(mov.quantidade, 10);
    if (!mov.produtoId || !['entrada','saida'].includes(mov.tipo) || !Number.isFinite(q) || q <= 0) {
      alert("Informe uma quantidade válida.");
      return;
    }
    try {
      await MovAPI.criar({
        produto_id: mov.produtoId,
        tipo: mov.tipo,
        quantidade: q,
        valor_final: mov.valor_final,
      });

      // atualiza linha localmente (otimista)
      setLinhas(prev => prev.map(x => {
        if (x.id !== mov.produtoId) return x;
        if (mov.tipo === 'entrada') {
          const entradas = x.entradas + q;
          const emEstoque = x.quantidadeInicial + entradas - x.saidas;
          return { ...x, entradas, emEstoque };
        } else {
          const saidas = x.saidas + q;
          const emEstoque = x.quantidadeInicial + x.entradas - saidas;
          return { ...x, saidas, emEstoque };
        }
      }));

      setMovOpen(false);
    } catch (e) {
      console.error("POST /movimentacoes ERRO:", e);
      alert(e?.response?.data?.message || "Falha ao registrar movimentação");
    }
  }

  async function saveEdit() {
    const p = produtoEdit || {};
    if (!p.nome?.trim() || !p.modelo?.trim()) { alert('Preencha "Produto" e "Modelo".'); return; }

    const normalized = {
      ...p,
      custo: Number(p?.custo) || 0,
      valorVenda: Number(p?.valorVenda) || 0,
      quantidadeMinima: parseInt(p?.quantidadeMinima, 10) || 0,
      garantia: parseInt(p?.garantia, 10) || 0,
      quantidadeInicial: parseInt(p?.quantidadeInicial, 10) || 0,
    };

    try {
      if (p.id) {
        const payload = mapUiToDb(normalized);
        const updated = await EstoqueAPI.atualizar(p.id, payload);
        const ui = mapDbToUi(updated);
        setLinhas((prev) => prev.map((x) => (x.id === ui.id ? ui : x)));
      } else {
        const payload = mapUiToDb(normalized);
        const created = await EstoqueAPI.criar(payload);
        const ui = mapDbToUi(created);
        setLinhas((prev) => [ui, ...prev]);
      }
      setEditOpen(false);
    } catch (e) {
      console.error("Salvar produto erro:", e);
      alert(e?.response?.data?.message || e?.message || "Falha ao salvar");
    }
  }

  // render
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16 }}>⚡ Estoque Premium</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Buscar..."
          value={filtro}
          onChange={(e) => { setPage(1); setFiltro(e.target.value); }}
          style={{ padding: 8, flex: 1, minWidth: 240 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={criticos} onChange={() => setCriticos((v) => !v)} />
          Só críticos
        </label>
        <button onClick={openNew} style={btnPrimary}>+ Novo Produto</button>
      </div>

      {errorMsg && (
        <div style={{ padding: 10, marginBottom: 10, background: "#ffebee", border: "1px solid #e53935", color: "#b71c1c" }}>
          {errorMsg}
        </div>
      )}
      {loading && <div style={{ marginBottom: 10 }}>Carregando…</div>}

      <div style={{ overflowX: "auto" }} ref={tableRef}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#111", color: "#fff" }}>
            <tr>
              {[
                ["nome", "Produto"],
                ["modelo", "Modelo"],
                ...(role === "admin" ? [["custo", "Custo"], ["valorVenda", "Valor Venda"], ["percent", "% Lucro"]] : [["valorVenda", "Valor Venda"]]),
                ["quantidadeMinima", "Qtd Mínima"],
                ["garantia", "Garantia"],
                ["quantidadeInicial", "Qtd Inicial"],
                ["entradas", "Entradas"],
                ["saidas", "Saídas"],
                ["emEstoque", "Em Estoque"],
                ["acoes", "Ações"],
              ].map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => key !== "acoes" && toggleSort(key)}
                  style={{ padding: 10, border: "1px solid #ccc", cursor: key !== "acoes" ? "pointer" : "default", whiteSpace: "nowrap" }}
                >
                  {label}{sortBy.key === key ? (sortBy.dir === "asc" ? " 🔼" : " 🔽") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, idx) => {
              const percent = r.custo > 0 ? ((r.valorVenda - r.custo) / r.custo) * 100 : 0;
              const estoqueClass =
                r.emEstoque <= 0 ? { color: "#c62828", fontWeight: 700 } :
                r.emEstoque <= r.quantidadeMinima ? { color: "#ed6c02", fontWeight: 700 } :
                { color: "#2e7d32", fontWeight: 700 };

              const isOpen = openMenuFor === r.id;

              return (
                <tr key={r.id ?? idx}>
                  <td style={td}>{r.nome}</td>
                  <td style={td}>{r.modelo}</td>
                  {role === "admin" ? (
                    <>
                      <td style={td}>R$ {Number(r.custo || 0).toFixed(2)}</td>
                      <td style={td}>R$ {Number(r.valorVenda || 0).toFixed(2)}</td>
                      <td style={td}>{percent.toFixed(2)}%</td>
                    </>
                  ) : (
                    <td style={td}>R$ {Number(r.valorVenda || 0).toFixed(2)}</td>
                  )}
                  <td style={td}>{r.quantidadeMinima}</td>
                  <td style={td}>{r.garantia}</td>
                  <td style={td}>{r.quantidadeInicial}</td>
                  <td style={td}>{r.entradas}</td>
                  <td style={td}>{r.saidas}</td>
                  <td style={{ ...td, ...estoqueClass }}>{r.emEstoque}</td>
                  <td style={td}>
                    <div style={actionWrap}>
                      <button
                        style={actionBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuFor(isOpen ? null : r.id);
                        }}
                      >
                        Ações ▾
                      </button>

                      {isOpen && (
                        <div style={menu} onClick={(e) => e.stopPropagation()}>
                          <button style={menuItem} onClick={() => { setOpenMenuFor(null); openEdit(r); }}>Editar</button>
                          <button style={menuItem} onClick={() => { setOpenMenuFor(null); openMov(r, "entrada"); }}>Entrada</button>
                          <button style={menuItem} onClick={() => { setOpenMenuFor(null); openMov(r, "saida"); }}>Saída</button>
                          <button style={menuItemDanger} onClick={() => { setOpenMenuFor(null); handleDelete(r.id); }}>Remover</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={12} style={{ ...td, textAlign: "center", fontStyle: "italic" }}>
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} style={btn}>
          ‹ Anterior
        </button>
        <span> Página <strong>{currentPage}</strong> de {pageCount} </span>
        <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount} style={btn}>
          Próxima ›
        </button>
      </div>

      {/* Modal Editar/Adicionar produto */}
      {editOpen && (
        <div style={backdrop} onClick={() => setEditOpen(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3>{produtoEdit?.id ? "Editar Produto" : "Novo Produto"}</h3>
            {["nome","modelo","custo","valorVenda","quantidadeMinima","garantia","quantidadeInicial"].map((field) => (
              <div key={field} style={{ marginBottom: 8 }}>
                <label style={{ display: "block", marginBottom: 4 }}>
                  {field.replace(/([A-Z])/g, " $1")}
                </label>
                <input
                  type={["custo","valorVenda","quantidadeMinima","garantia","quantidadeInicial"].includes(field) ? "number" : "text"}
                  value={produtoEdit?.[field] ?? ""}
                  onChange={(e) => setProdutoEdit((prev) => ({ ...prev, [field]: e.target.value }))}
                  style={{ width: "100%", padding: 8 }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setEditOpen(false)} style={btn}>Cancelar</button>
              <button onClick={saveEdit} style={btnPrimary}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Movimentação */}
      {movOpen && (
        <div style={backdrop} onClick={() => setMovOpen(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3>Registrar {mov.tipo === 'entrada' ? 'Entrada' : 'Saída'}</h3>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", marginBottom: 4 }}>Quantidade *</label>
              <input
                type="number"
                min="1"
                value={mov.quantidade}
                onChange={(e) => setMov(prev => ({ ...prev, quantidade: e.target.value }))}
                style={{ width: "100%", padding: 8 }}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", marginBottom: 4 }}>Valor total (opcional)</label>
              <input
                type="number"
                step="0.01"
                value={mov.valor_final}
                onChange={(e) => setMov(prev => ({ ...prev, valor_final: e.target.value }))}
                style={{ width: "100%", padding: 8 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setMovOpen(false)} style={btn}>Cancelar</button>
              <button onClick={saveMov} style={btnPrimary}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
