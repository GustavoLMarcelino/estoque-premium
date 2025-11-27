import React, { useEffect, useMemo, useState } from "react";
import { GarantiasAPI } from "../../services/garantias";
import TitleComponent from "../../components/TitleComponent";
import InputComponent from "../../components/InputComponent";
import ErrorMsg from "../../components/ErrorMsgComponent";
import TableComponent from "../../components/TableComponent";

const pill = (c) => ({ fontWeight: 700, color: c });

export default function GarantiaLista() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true); setErrorMsg("");
      try {
        const res = await GarantiasAPI.listar({ q, page: 1, pageSize: 200 }); // contínuo
        if (!alive) return;
        setRows(res.data || []);
      } catch (e) {
        if (!alive) return;
        console.error(e);
        setErrorMsg(e?.response?.data?.message || "Falha ao carregar garantias");
      } finally {
        if (alive) setLoading(false);
      }
    }
    const t = setTimeout(load, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const statusColor = (s) => {
    switch (s) {
      case "ABERTA": return "#1f2937";
      case "EM_ANALISE": return "#6b7280";
      case "APROVADA": return "#2563eb";
      case "REPROVADA": return "#b91c1c";
      case "FINALIZADA": return "#047857";
      default: return "#374151";
    }
  };

  const sorted = useMemo(() => rows, [rows]);

  return (
    <div className="p-[16px]">
      <TitleComponent text={"📄 Garantias"}/>

      <div className="flex mb-[12px]">
        <InputComponent placeholder="Buscar por cliente, documento, produto..." value={q} onChange={(e) => setQ(e.target.value)}/>
      </div>

      {errorMsg && <ErrorMsg errorMsg={errorMsg}/>}
      {loading && <p className="mb-[10px] text-[#6b7280] !text-base max-xl:!text-xs">Carregando…</p>}

      <div className="overflow-auto border-2 border-[var(--g-border)] rounded-[12px] bg-white">
        <TableComponent
          columns={[
            {key: "cliente_nome", label: "Cliente", sortable: true, render: (r) => r.cliente_nome},
            {key: "cliente_documento", label: "Doc", sortable: true, render: (r) => r.cliente_documento},
            {key: "cliente_telefone", label: "Telefone", sortable: true, render: (r) => r.cliente_telefone},
            {key: "produto_codigo", label: "Produto", sortable: true, render: (r) => (r.produto_codigo + " - " + r.produto_descricao)},
            {key: "status", label: "Status", sortable: true, render: (r) => (<span style={pill(statusColor(r.status))}>{r.status}</span>)},
            {key: "data_abertura", label: "Abertura", sortable: true, render: (r) => (new Date(r.data_abertura).toLocaleString("pt-BR"))},
            {key: "data_limite", label: "Limite", sortable: true, render: (r) => (new Date(r.data_limite).toLocaleDateString("pt-BR"))}
          ]}
          data={sorted}
          noData={"Nenhuma garantia encontrada."}
        />
      </div>
    </div>
  );
}
