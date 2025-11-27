import React, { useEffect, useMemo, useState, useCallback } from "react";
import { EstoqueAPI } from "../../services/estoque";
import { MovAPI } from "../../services/movimentacoes";
import TitleComponent from "../../components/TitleComponent";
import InputComponent from "../../components/InputComponent";
import LabelComponent from "../../components/LabelComponent";
import ErrorMsg from "../../components/ErrorMsgComponent";
import TableComponent from "../../components/TableComponent";
import EditModal from "../../components/EditModal";
import ButtonComponent from "../../components/ButtonComponent";
import ActionsComponent from "../../components/ActionsComponent";
import MovModal from "../../components/MovModal";

const labelChip = (active) => `flex text-nowrap items-center gap-[6px] border border-[#e5e7eb] p-[8px_12px] rounded-[8px] cursor-pointer ${active ? "bg-[#eef2ff]" : "bg-[#f9fafb]"} text-[#111827] font-semibold`;

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
  return {
    produto: p.nome,
    modelo: p.modelo,
    custo: toMoney(p.custo),
    valor_venda: toMoney(p.valorVenda),
    qtd_minima: toInt(p.quantidadeMinima),
    garantia: toInt(p.garantia),            // backend formata "X meses"
    qtd_inicial: toInt(p.quantidadeInicial),
  };
}

export default function Estoque() {
  // ==== Helpers de tipagem de estoque (persistência local) ====
const TIPO_KEY = 'estoqueTipos'; // { [produtoId]: 'baterias' | 'som' }
function loadTipos() { try { return JSON.parse(localStorage.getItem(TIPO_KEY) || '{}'); } catch { return {}; } }
const tiposMap = loadTipos();
const [role] = useState(() => localStorage.getItem("role") || "admin");
  const [linhas, setLinhas] = useState([]);
  const [filtro, setFiltro] = useState(() => localStorage.getItem("estoqueFilter") || "");
  const [criticos, setCriticos] = useState(false);

  const [sortBy, setSortBy] = useState({ key: "nome", dir: "asc" });

  const [editOpen, setEditOpen] = useState(false);
  const [produtoEdit, setProdutoEdit] = useState(null);

  // modal de movimentação
  const [movOpen, setMovOpen] = useState(false);
  const [mov, setMov] = useState({ produtoId: null, tipo: "entrada", quantidade: 0, valor_final: "" });

  // dropdown fixo
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

  // abre/posiciona menu usando bounding rect do botão
  function toggleMenuForRow(rowId, ev) {
    ev.stopPropagation();
    const btnRect = ev.currentTarget.getBoundingClientRect();
    const MENU_W = 190;
    const MENU_H = 184; // estimativa
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
      alert(e?.response?.data?.message || "Falha ao registrar movimentação");
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
      if (p.id) {
        const payload = mapUiToDb(normalized);
        const updated = await EstoqueAPI.atualizar(p.id, payload);
        const ui = mapDbToUi(updated);
        setLinhas((prev) => prev.map((x) => (x.id === ui.id ? ui : x)));
      } else {
        // caminho de criação permanece por compatibilidade, mas sem gatilho na UI
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

  return (
    <div className="p-[16px]">
      <TitleComponent text={"🔋 Estoque de Baterias"}/>

      <div className='grid grid-cols-[10.7fr_1.3fr] gap-[8px] mb-[12px] items-center max-[450px]:flex-wrap'>
        <InputComponent placeholder={"Buscar..."} value={filtro} onChange={(e) => setFiltro(e.target.value)}/>
        <div className={labelChip(criticos)}>
          <InputComponent idName={"checkbox"} type={"checkbox"} checked={criticos} onChange={() => setCriticos(v => !v)}/>
          <LabelComponent text={"Só críticos"} htmlFor={"checkbox"}/>
        </div>
      </div>

      {errorMsg && (
        <ErrorMsg errorMsg={errorMsg}/>
      )}
      {loading && <p className="mb-[10px] text-[#6b7280] !text-base max-xl:!text-xs">Carregando…</p>}

      <div className='overflow-x-auto border border-[#e5e7eb] rounded-[12px] bg-white shadow-[0px_1px_6px_rgba(0,0,0,0.08)]'>
        <TableComponent
          columns={[
            {key: "nome", label: "Produto", sortable: true}, 
            {key: "modelo", label: "Modelo", sortable: true},
            ...(role === "admin" ?
              [
                {key: "custo", label: "Custo", sortable: true, render: (r) => `R$ ${Number(r.custo || 0).toFixed(2)}`}, 
                {key: "valorVenda", label: "Valor Venda", sortable: true, render: (r) => `R$ ${Number(r.valorVenda || 0).toFixed(2)}`}, 
                {key: "percent", label: "% Lucro", sortable: true, render: (r) => {const percent = r.custo > 0 ? ((r.valorVenda - r.custo) / r.custo) * 100 : 0; return `${percent.toFixed(2)}%`}},
              ] :
              [
                {key: "valorVenda", label: "Valor Venda", sortable: true, render: (r) => `R$ ${Number(r.valorVenda || 0).toFixed(2)}`},
              ]
            ),
            {key: "quantidadeMinima", label: "Qtd Mínima", sortable: true}, 
            {key: "garantia", label: "Garantia", sortable: true}, 
            {key: "quantidadeInicial", label: "Qtd Inicial", sortable: true}, 
            {key: "entradas", label: "Entradas", sortable: true}, 
            {key: "saidas", label: "Saídas", sortable: true}, 
            {key: "emEstoque", label: "Em Estoque", sortable: true, render: (r) => {
              const estoqueStyle = r.emEstoque <= 0 ? 
              { color: '#c62828', fontWeight: 700 } :
              r.emEstoque <= r.quantidadeMinima ?
              { color: '#ed6c02', fontWeight: 700 } :
              { color: '#2e7d32', fontWeight: 700 }
              return(
                <span style={estoqueStyle}>{r.emEstoque}</span>
              )
            }},
            {key: "acoes", label: "Ações", render: (r) => (
              <>
                <ButtonComponent variant={"primary"} onClick={(e) => toggleMenuForRow(r.id, e)} text={"Ações ▾"}/>
              </>
            )}
          ]}
          data={sorted}
          noData={'Nenhum produto encontrado.'}
        />
      </div>

      {menuOpenId && 
        <ActionsComponent
          rowId={menuOpenId}
          position={menuPos}
          linhas={linhas}
          onClose={() => setMenuOpenId(null)}
          onEdit={openEdit}
          onMovimentar={(row, tipo) => {
            setMov({
              produtoId: row.id,
              tipo: tipo,
              quantidade: 1,
              valor_final: "",
              formaPagamento: "",
              parcelas: 1,
            });
            setMovOpen(true);
          }}
          onDelete={handleDelete}
        />
      }

      {editOpen && (
        <EditModal
          editOpen={editOpen}
          setEditOpen={setEditOpen}
          produtoEdit={produtoEdit}
          setProdutoEdit={setProdutoEdit}
          saveEdit={saveEdit}
        />
      )}

      {movOpen && 
        <MovModal
          mov={mov}
          setMov={setMov}
          saveMov={saveMov}
          setMovOpen={setMovOpen}
        />
      }
    </div>
  );
}
