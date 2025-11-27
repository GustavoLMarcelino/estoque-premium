import React, { useEffect, useMemo, useState, useCallback } from "react";
import { EstoqueAPI } from "../../services/estoque";
import { MovAPI } from "../../services/movimentacoes";
import { EstoqueSomAPI } from "../../services/estoqueSom";
import { MovSomAPI } from "../../services/movimentacoesSom";
import { ESTOQUE_TIPOS } from "../../services/estoqueTipos";
import TitleComponent from "../../components/TitleComponent";
import InputComponent from "../../components/InputComponent";
import LabelComponent from "../../components/LabelComponent";
import SelectComponent from "../../components/SelectComponent";
import ButtonComponent from "../../components/ButtonComponent";
import ErrorMsg from "../../components/ErrorMsgComponent";
import TableComponent from "../../components/TableComponent";
import ActionsComponent from "../../components/ActionsComponent";
import EditModal from "../../components/EditModal";
import MovModal from "../../components/MovModal";

const labelChip = (active) => `flex text-nowrap items-center gap-[6px] border border-[#e5e7eb] p-[8px_12px] rounded-[8px] cursor-pointer ${active ? "bg-[#eef2ff]" : "bg-[#f9fafb]"} text-[#111827] font-semibold`;

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

  return (
    <div className="p-[16px]">
      <TitleComponent text={"Registro de Movimentações"}/>

      <div className="grid grid-cols-[6fr_4fr] gap-[8px] mb-[12px] max-[550px]:grid-cols-1 max-md:grid-cols-[2fr_3fr]">
        <div className="max-[550px]:col-span-2">
          <InputComponent placeholder="Buscar..." value={filtro} onChange={(e) => setFiltro(e.target.value)}/>
        </div>
        <div className="grid grid-cols-3 gap-[8px] max-[450px]:grid-cols-2 max-[550px]:col-span-2">
          <div className={labelChip(criticos)}>
            <InputComponent idName={"criticos"} type="checkbox" checked={criticos} onChange={() => setCriticos((v) => !v)} />
            <LabelComponent htmlFor={"criticos"} text={"Só críticos"}/>
          </div>
          <SelectComponent value={tipoEstoque} onChange={(e) => setTipoEstoque(e.target.value)}>
            <option value={ESTOQUE_TIPOS.BATERIAS}>Baterias</option>
            <option value={ESTOQUE_TIPOS.SOM}>Som</option>
          </SelectComponent>
          <ButtonComponent text={"+ Novo Produto"} onClick={openNew} variant={"primary"}/>
        </div>
      </div>

      {errorMsg && <ErrorMsg errorMsg={errorMsg}/>}
      {loading && <p className="mb-[10px] text-[#6b7280] !text-base max-xl:!text-xs">Carregando...</p>}

      <div className="overflow-x-auto border-2 border-[var(--g-border)] rounded-[12px] bg-white">
        <TableComponent 
          columns={[
            {key: "nome", label: "Produto", sortable: true, render: (r) => r.nome},
            {key: "modelo", label: "Modelo", sortable: true, render: (r) => r.modelo},
            ...(role === "admin" ? [
              {key: "custo", label: "Custo", sortable: true, render: (r) => `R$ ${Number(r.custo || 0).toFixed(2)}`},
              {key: "valorVenda", label: "Valor Venda", sortable: true, render: (r) => `R$ ${Number(r.valorVenda || 0).toFixed(2)}`},
              {key: "percent", label: "% Lucro", sortable: true, render: (r) => {const percent = r.custo > 0 ? ((r.valorVenda - r.custo) / r.custo) * 100 : 0; return `${percent.toFixed(2)}%`}}
            ] : [
              {key: "valorVenda", label: "Valor Venda", sortable: true, render: (r) => `R$ ${Number(r.valorVenda || 0).toFixed(2)}`}
            ]),
            {key: "quantidadeMinima", label: "Qtd Minima", sortable: true, render: (r) => r.quantidadeMinima},
            {key: "garantia", label: "Garantia", sortable: true, render: (r) => r.garantia},
            {key: "tipoEstoque", label: "Estoque", sortable: true, render: (r) => tipoEstoque === ESTOQUE_TIPOS.SOM ? "Som" : "Baterias"},
            {key: "quantidadeInicial", label: "Qtd Inicial", sortable: true, render: (r) => r.quantidadeInicial},
            {key: "entradas", label: "Entradas", sortable: true, render: (r) => r.entradas},
            {key: "saidas", label: "Saídas", sortable: true, render: (r) => r.saidas},
            {key: "emEstoque", label: "Em Estoque", sortable: true, render: (r) => {
              const estoqueClass = r.emEstoque <= 0
                ? { color: "#b91c1c", fontWeight: 700 }
                : r.emEstoque <= r.quantidadeMinima
                ? { color: "#b45309", fontWeight: 700 }
                : { color: "#166534", fontWeight: 700 };
                return <span style={estoqueClass}>{r.emEstoque}</span>
              }
            },
            {key: "acoes", label: "Ações", sortable: true, render: (r) => (<ButtonComponent variant={"primary"} onClick={(e) => toggleMenuForRow(r.id, e)} text={"Ações ▾"}/>)}
          ]}
          data={sorted}
          noData={"Nenhum produto encontrado."}
        />
      </div>

      {menuOpenId && (
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
      )}

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
