import React, { useMemo, useState, useEffect } from "react";
import { fakeDb } from "../Garantia/GarantiaCadastro";
import InputComponent from "../../components/InputComponent";
import TableComponent from "../../components/TableComponent";
import { keyboard } from "@testing-library/user-event/dist/cjs/keyboard/index.js";
import { render } from "@testing-library/react";
import GarantiaModal from "../../components/GarantiaModal";
import TitleComponent from "../../components/TitleComponent";
import SelectComponent from "../../components/SelectComponent";
import ButtonComponent from "../../components/ButtonComponent";
import { IoIosArrowBack, IoIosArrowForward } from "react-icons/io";

const Badge = ({ status }) => (
  <span className={`border-[1.5px] p-[3px_8px] rounded-full text-xs font-semibold g-badge--${String(status || "").toLowerCase().replace(/_/g, "-")}`}>
    {status}
  </span>
);

/* ===== Utils ===== */
const toDateInput = (d) => {
  if (!d) return "";
  try {
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    if (typeof d === "string" && d.includes("/")) {
      const [dd, mm, yyyy] = d.split("/");
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    const dt = new Date(d);
    return isNaN(dt) ? "" : dt.toISOString().slice(0, 10);
  } catch {
    return "";
  }
};

const toPtBR = (yyyy_mm_dd) => {
  if (!yyyy_mm_dd) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyy_mm_dd)) return yyyy_mm_dd; // já veio formatado
  const [y, m, d] = yyyy_mm_dd.split("-");
  return `${d}/${m}/${y}`;
};

export default function GarantiasLista() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("TODOS");

  // Mantém a fonte de dados em estado local para re-render imediato após salvar
  const [garantias, setGarantias] = useState(() => fakeDb?.garantias ?? []);

  const [selected, setSelected] = useState(null);
  const [editando, setEditando] = useState(false);

  // Form controlado do popup
  const [form, setForm] = useState({
    id: null,
    cliente: { nome: "", documento: "", telefone: "", endereco: "" },
    produto: { codigo: "", descricao: "" },
    garantia: {
      dataCompra: "", // yyyy-mm-dd
      status: "ABERTA",
      descricaoProblema: "",
      fotos: [],
    },
    emprestimo: { ativo: false, produtoCodigo: "", quantidade: 0 },
  });

  // Abriu popup? carrega o form
  useEffect(() => {
    if (!selected) return;
    const g = selected;
    setForm({
      id: g.id,
      cliente: {
        nome: g.cliente?.nome || "",
        documento: g.cliente?.documento || "",
        telefone: g.cliente?.telefone || "",
        endereco: g.cliente?.endereco || "",
      },
      produto: {
        codigo: g.produto?.codigo || "",
        descricao: g.produto?.descricao || "",
      },
      garantia: {
        dataCompra: toDateInput(g.garantia?.dataCompra),
        status: g.garantia?.status || "ABERTA",
        descricaoProblema: g.garantia?.descricaoProblema || "",
        fotos: Array.isArray(g.garantia?.fotos) ? g.garantia.fotos : [],
      },
      emprestimo: {
        ativo: !!g.emprestimo?.ativo,
        produtoCodigo: g.emprestimo?.produtoCodigo || "",
        quantidade: g.emprestimo?.quantidade || 0,
      },
    });
  }, [selected]);

  // Lista filtrada
  const lista = useMemo(() => {
    return (garantias ?? []).filter((g) => {
      const txt = `${g.cliente?.nome || ""} ${g.produto?.codigo || ""} ${g.produto?.descricao || ""}`;
      const okBusca = txt.toLowerCase().includes(busca.toLowerCase());
      const okStatus = status === "TODOS" ? true : (g.garantia?.status || "") === status;
      return okBusca && okStatus;
    });
  }, [garantias, busca, status]);

  // Helpers para atualizar o form
  const setCliente = (k, v) => setForm((f) => ({ ...f, cliente: { ...f.cliente, [k]: v } }));
  const setProduto = (k, v) => setForm((f) => ({ ...f, produto: { ...f.produto, [k]: v } }));
  const setGarantia = (k, v) => setForm((f) => ({ ...f, garantia: { ...f.garantia, [k]: v } }));

  // Salvar alterações
  const handleSave = () => {
    if (!form.id) return;
    const idx = (fakeDb.garantias || []).findIndex((x) => x.id === form.id);
    if (idx === -1) return;

    const updated = {
      ...fakeDb.garantias[idx],
      cliente: { ...fakeDb.garantias[idx].cliente, ...form.cliente },
      produto: { ...fakeDb.garantias[idx].produto, ...form.produto },
      garantia: {
        ...fakeDb.garantias[idx].garantia,
        dataCompra: form.garantia.dataCompra, // mantemos ISO yyyy-mm-dd no fake
        status: form.garantia.status,
        descricaoProblema: form.garantia.descricaoProblema,
        fotos: form.garantia.fotos,
      },
      // emprestimo não é editado aqui
    };

    // persiste no "banco" fake e atualiza estado local
    fakeDb.garantias[idx] = updated;
    setGarantias([...fakeDb.garantias]); // nova referência -> re-render

    setSelected(updated);
    setEditando(false);
  };

  // Arquivos (demo): apenas lista nomes/urls
  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    const nomes = files.map((f) => f.name || f.webkitRelativePath || String(f));
    setGarantia("fotos", [...(form.garantia.fotos || []), ...nomes]);
  };

  const [page, setPage] = useState(1);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(lista.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return lista.slice(start, end);
  }, [lista, currentPage]);

  return (
    <div className="p-[16px]">
      <TitleComponent text={"Garantias - Consulta"}/>

      <div className="flex gap-[10px] mb-[12px] max-[400px]:flex-wrap">
        <InputComponent placeholder={"Buscar cliente, código ou descrição..."} value={busca} onChange={(e) => setBusca(e.target.value)}/>
        <SelectComponent value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="TODOS">Todos</option>
          <option value="ABERTA">ABERTA</option>
          <option value="EM_ANALISE">EM_ANALISE</option>
          <option value="APROVADA">APROVADA</option>
          <option value="REPROVADA">REPROVADA</option>
          <option value="FINALIZADA">FINALIZADA</option>
        </SelectComponent>
      </div>

      <div className="overflow-auto border-2 border-[var(--g-border)] rounded-[12px] bg-white">
        <TableComponent columns={[
          {key: "cliente", label: "Cliente", render: (g) => g.cliente?.nome}, 
          {key: "documento", label: "Documento", render: (g) => g.cliente?.documento}, 
          {key: "telefone", label: "Telefone", render: (g) => g.cliente?.telefone}, 
          {key: "código", label: "Código", render: (g) => g.produto?.codigo}, 
          {key: "descrição", label: "Descrição", render: (g) => g.produto?.descricao}, 
          {key: "compra", label: "Compra", render: (g) => g.garantia?.dataCompra ? (g.garantia.dataCompra.includes("-") ? toPtBR(g.garantia.dataCompra) : g.garantia.dataCompra) : "-"},
          {key: "status", label: "Status", render: (g) => <Badge status={g.garantia?.status || "ABERTA"} />},
          {key: "acoes", label: "Ações", render: (g) => <>
          <ButtonComponent text={"Ver"} variant={"ghost"} onClick={() => { setSelected(g); setEditando(false); }}/>
          <ButtonComponent text={"Editar"} variant={"primary"} onClick={() => { setSelected(g); setEditando(true); }}/>
          </>}
        ]}
        data={paged}
        noData={"Nenhuma garantia encontrada."}
        />
      </div>
      <div className='flex gap-[12px] items-center mt-[12px]'>
        <ButtonComponent onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} variant={"ghost"} text={<span className='flex items-center mr-1.5 gap-1'><IoIosArrowBack/>Anterior</span>}/>
        <span className='!text-base max-xl:!text-xs'>
          Página <strong>{currentPage}</strong> de {pageCount}
        </span>
        <ButtonComponent onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount} variant={"ghost"} text={<span className='flex items-center ml-1.5 gap-1'>Próxima<IoIosArrowForward/></span>}/>
      </div>
      {selected && (
        <GarantiaModal
          selected={selected}
          editando={editando}
          form={form}
          setCliente={setCliente}
          setProduto={setProduto}
          setGarantia={setGarantia}
          handleFiles={handleFiles}
          handleSave={handleSave}
          setSelected={setSelected}
        />
      )}
    </div>
  );
}
