import React, { useEffect, useMemo, useState, useCallback } from "react";
import { EstoqueAPI } from "../../services/estoque";
import { MovAPI } from "../../services/movimentacoes";
import { EstoqueSomAPI } from "../../services/estoqueSom";
import { MovSomAPI } from "../../services/movimentacoesSom";
import { ESTOQUE_TIPOS } from "../../services/estoqueTipos";

const tableWrap = {
  overflowX: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
};
const table = { width: "100%", borderCollapse: "collapse" };
const thBase = {
  padding: 12,
  textAlign: "left",
  borderBottom: "1px solid #e5e7eb",
  background: "#f3f4f6",
  color: "#111827",
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: "nowrap",
};
const thClickable = { ...thBase, cursor: "pointer", userSelect: "none" };
const td = { borderBottom: "1px solid #e5e7eb", padding: 10, whiteSpace: "nowrap", color: "#111827" };

const inputBox = {
  padding: 10,
  minWidth: 260,
  flex: 1,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  outline: "none",
  background: "#fff",
};
const labelChip = (active) => ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #e5e7eb",
  padding: "8px 12px",
  borderRadius: 8,
  cursor: "pointer",
  background: active ? "#eef2ff" : "#f9fafb",
  color: "#111827",
  fontWeight: 600,
});

const btn = { padding: "8px 12px", border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", borderRadius: 8, color: "#111827" };
const btnPrimary = { ...btn, background: "#2563eb", color: "#fff", borderColor: "#2563eb" };
const btnSm = { ...btn, padding: "6px 10px", borderRadius: 8 };
const btnGhost = { ...btn, background: "#fff" };

const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1999, display: "flex", alignItems: "center", justifyContent: "center" };
const modal = { background: "#fff", width: "min(460px, 92vw)", borderRadius: 12, padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.2)" };

const actionBtn = { ...btnSm, background: "#2563eb", borderColor: "#2563eb", color: "#fff" };
const menuBoxFixed = {
  position: "fixed",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
  minWidth: 190,
  padding: 6,
  zIndex: 3000,
};
const menuItem = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  borderRadius: 8,
};
const menuItemDanger = { ...menuItem, color: "#b91c1c" };

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

  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const close = () => setMenuOpenId(null);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, []);

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

  function toggleMenuForRow(rowId, ev) {
    ev.stopPropagation();
    const btnRect = ev.currentTarget.getBoundingClientRect();
    const MENU_W = 190;
    const MENU_H = 184;
    const GAP = 8;

    const spaceBelow = window.innerHeight - btnRect.bottom;
    const openUp = spaceBelow < MENU_H + GAP;

    let top = openUp ? btnRect.top - MENU_H - GAP : btnRect.bottom + GAP;
    let left = btnRect.right - MENU_W;
    if (left < 8) left = 8;

    setMenuPos({ top, left });
    setMenuOpenId((prev) => (prev === rowId ? null : rowId));
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

  const columns = [
    ["nome", "Produto"],
    ["modelo", "Modelo"],
    ...(role === "admin"
      ? [
          ["custo", "Custo"],
          ["valorVenda", "Valor Venda"],
          ["percent", "% Lucro"],
        ]
      : [["valorVenda", "Valor Venda"]]),
    ["quantidadeMinima", "Qtd Minima"],
    ["garantia", "Garantia"],
    ["tipoEstoque", "Estoque"],
    ["quantidadeInicial", "Qtd Inicial"],
    ["entradas", "Entradas"],
    ["saidas", "Saidas"],
    ["emEstoque", "Em Estoque"],
    ["acoes", "Acoes"],
  ];

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16, color: "#111827" }}>Registro de Movimentacoes</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          placeholder="Buscar..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          style={inputBox}
        />
        <label style={labelChip(criticos)}>
          <input type="checkbox" checked={criticos} onChange={() => setCriticos((v) => !v)} />
          So criticos
        </label>
        <select value={tipoEstoque} onChange={(e) => setTipoEstoque(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <option value={ESTOQUE_TIPOS.BATERIAS}>Baterias</option>
          <option value={ESTOQUE_TIPOS.SOM}>Som</option>
        </select>
        <button onClick={openNew} style={btnPrimary}>+ Novo Produto</button>
      </div>

      {errorMsg && (
        <div style={{ padding: 10, marginBottom: 10, background: "#fee2e2", border: "1px solid #fca5a5", color: "#7f1d1d", borderRadius: 8 }}>
          {errorMsg}
        </div>
      )}
      {loading && <div style={{ marginBottom: 10, color: "#6b7280" }}>Carregando...</div>}

      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr>
              {columns.map(([columnKey, label]) => (
                <th
                  key={columnKey}
                  onClick={() => columnKey !== "acoes" && toggleSort(columnKey)}
                  style={columnKey !== "acoes" ? thClickable : thBase}
                  title={columnKey !== "acoes" ? "Clique para ordenar" : undefined}
                >
                  {label}
                  {sortBy.field === columnKey ? (sortBy.dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => {
              const percent = r.custo > 0 ? ((r.valorVenda - r.custo) / r.custo) * 100 : 0;
              const estoqueClass =
                r.emEstoque <= 0
                  ? { color: "#b91c1c", fontWeight: 700 }
                  : r.emEstoque <= r.quantidadeMinima
                  ? { color: "#b45309", fontWeight: 700 }
                  : { color: "#166534", fontWeight: 700 };

              return (
                <tr key={r.id ?? idx} style={{ background: "#fff" }}>
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
                  <td style={td}>{tipoEstoque === ESTOQUE_TIPOS.SOM ? "Som" : "Baterias"}</td>
                  <td style={td}>{r.quantidadeInicial}</td>
                  <td style={td}>{r.entradas}</td>
                  <td style={td}>{r.saidas}</td>
                  <td style={{ ...td, ...estoqueClass }}>{r.emEstoque}</td>
                  <td style={td}>
                    <button style={actionBtn} onClick={(e) => toggleMenuForRow(r.id, e)}>
                      Acoes ▼
                    </button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} style={{ ...td, textAlign: "center", fontStyle: "italic", color: "#6b7280" }}>
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {menuOpenId && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 2500 }} onClick={() => setMenuOpenId(null)} />
          <div style={{ ...menuBoxFixed, top: menuPos.top, left: menuPos.left }} onClick={(e) => e.stopPropagation()}>
            <button
              style={menuItem}
              onClick={() => {
                setMenuOpenId(null);
                const row = linhas.find((x) => x.id === menuOpenId);
                if (row) openEdit(row);
              }}
            >
              Editar
            </button>
            <button
              style={menuItem}
              onClick={() => {
                setMenuOpenId(null);
                const row = linhas.find((x) => x.id === menuOpenId);
                if (row) openMov(row, "entrada");
              }}
            >
              Entrada
            </button>
            <button
              style={menuItem}
              onClick={() => {
                setMenuOpenId(null);
                const row = linhas.find((x) => x.id === menuOpenId);
                if (row) openMov(row, "saida");
              }}
            >
              Saida
            </button>
            <hr style={{ border: "none", borderTop: "1px solid #eee", margin: "6px 0" }} />
            <button
              style={menuItemDanger}
              onClick={() => {
                const id = menuOpenId;
                setMenuOpenId(null);
                handleDelete(id);
              }}
            >
              Remover
            </button>
          </div>
        </>
      )}

      {editOpen && (
        <div style={overlay} onClick={() => setEditOpen(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 12, color: "#111827" }}>
              {produtoEdit?.id ? "Editar Produto" : "Novo Produto"}
            </h3>
            {["nome", "modelo", "custo", "valorVenda", "quantidadeMinima", "garantia", "quantidadeInicial"].map((field) => (
              <div key={field} style={{ marginBottom: 10 }}>
                <label style={{ display: "block", marginBottom: 6, color: "#374151", fontSize: 13 }}>
                  {field.replace(/([A-Z])/g, " $1")}
                </label>
                <input
                  type={["custo", "valorVenda", "quantidadeMinima", "garantia", "quantidadeInicial"].includes(field) ? "number" : "text"}
                  value={produtoEdit?.[field] ?? ""}
                  onChange={(e) => setProdutoEdit((prev) => ({ ...prev, [field]: e.target.value }))}
                  style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 8, outline: "none" }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setEditOpen(false)} style={btnGhost}>Cancelar</button>
              <button onClick={saveEdit} style={btnPrimary}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {movOpen && (
        <div style={overlay} onClick={() => setMovOpen(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 12, color: "#111827" }}>
              Registrar {mov.tipo === "entrada" ? "Entrada" : "Saida"}
            </h3>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", marginBottom: 6, color: "#374151", fontSize: 13 }}>Quantidade *</label>
              <input
                type="number"
                min="1"
                value={mov.quantidade}
                onChange={(e) => setMov((prev) => ({ ...prev, quantidade: e.target.value }))}
                style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 8, outline: "none" }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", marginBottom: 6, color: "#374151", fontSize: 13 }}>
                Valor unitario final (opcional)
              </label>
              <input
                type="number"
                step="0.01"
                value={mov.valor_final}
                onChange={(e) => setMov((prev) => ({ ...prev, valor_final: e.target.value }))}
                style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 8, outline: "none" }}
              />
            </div>
            {mov.tipo === "saida" && (
              <>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "block", marginBottom: 6, color: "#374151", fontSize: 13 }}>
                    Forma de pagamento *
                  </label>
                  <select
                    value={mov.formaPagamento}
                    onChange={(e) =>
                      setMov((prev) => ({
                        ...prev,
                        formaPagamento: e.target.value,
                        parcelas: e.target.value === "credito" ? prev.parcelas : 1,
                      }))
                    }
                    style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  >
                    <option value="">Selecione...</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="pix">Pix</option>
                    <option value="debito">Debito</option>
                    <option value="credito">Credito</option>
                  </select>
                </div>
                {mov.formaPagamento === "credito" && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: "block", marginBottom: 6, color: "#374151", fontSize: 13 }}>
                      Parcelas
                    </label>
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
                      style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 8, outline: "none" }}
                    />
                  </div>
                )}
              </>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setMovOpen(false)} style={btnGhost}>Cancelar</button>
              <button onClick={saveMov} style={btnPrimary}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
