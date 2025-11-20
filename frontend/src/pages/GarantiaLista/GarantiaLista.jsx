import React, { useEffect, useMemo, useState } from "react";
import { GarantiasAPI } from "../../services/garantias";

const tableWrap = { overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" };
const table = { width: "100%", borderCollapse: "collapse" };
const th = { padding: 12, textAlign: "left", borderBottom: "1px solid #e5e7eb", background: "#f3f4f6", color: "#111827", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" };
const td = { borderBottom: "1px solid #e5e7eb", padding: 10, whiteSpace: "nowrap" };
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
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16, color: "#111827" }}>📄 Garantias</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Buscar por cliente, documento, produto..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ padding: 10, minWidth: 300, border: "1px solid #e5e7eb", borderRadius: 8, outline: "none", background: "#fff", flex: 1 }}
        />
      </div>

      {errorMsg && <div style={{ padding: 10, background: "#ffebee", border: "1px solid #e53935", color: "#b71c1c", marginBottom: 10 }}>{errorMsg}</div>}
      {loading && <div style={{ marginBottom: 10 }}>Carregando…</div>}

      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Cliente</th>
              <th style={th}>Doc</th>
              <th style={th}>Telefone</th>
              <th style={th}>Produto</th>
              <th style={th}>Status</th>
              <th style={th}>Abertura</th>
              <th style={th}>Limite</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length ? sorted.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.cliente_nome}</td>
                <td style={td}>{r.cliente_documento}</td>
                <td style={td}>{r.cliente_telefone}</td>
                <td style={td}>{r.produto_codigo} — {r.produto_descricao}</td>
                <td style={{ ...td, ...pill(statusColor(r.status)) }}>{r.status}</td>
                <td style={td}>{new Date(r.data_abertura).toLocaleString("pt-BR")}</td>
                <td style={td}>{new Date(r.data_limite).toLocaleDateString("pt-BR")}</td>
              </tr>
            )) : (
              <tr><td style={{ ...td, fontStyle: "italic", color: "#6b7280" }} colSpan={7}>Nenhuma garantia encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
