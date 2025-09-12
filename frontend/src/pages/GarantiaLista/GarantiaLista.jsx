// src/pages/GarantiaLista/GarantiaLista.jsx
import React, { useMemo, useState } from "react";
import "./GarantiaLista.css";
import { fakeDb } from "../Garantia/GarantiaCadastro"; // caminho certo

const Badge = ({ status }) => (
  <span className={`g-badge g-badge--${String(status || "")
    .toLowerCase()
    .replace("_", "-")}`}>{status}</span>
);

export default function GarantiasLista() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("TODOS");

  const garantias = (fakeDb?.garantias) ?? [];

  const lista = useMemo(() => {
    return garantias.filter((g) => {
      const txt = (
        (g.cliente?.nome || "") + " " +
        (g.produto?.codigo || "") + " " +
        (g.produto?.descricao || "")
      ).toLowerCase();

      const okBusca = txt.includes(busca.toLowerCase());
      const okStatus = status === "TODOS" ? true : ((g.garantia?.status || "") === status);
      return okBusca && okStatus;
    });
  }, [garantias, busca, status]);

  return (
    <div className="garantia-container">
      <h1 className="g-title">Garantias - Consulta</h1>

      <div className="g-list-toolbar">
        <input
          className="g-input g-input--sm"
          placeholder="Buscar por cliente, código ou descrição..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select
          className="g-input g-input--sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="TODOS">Todos</option>
          <option value="ABERTA">ABERTA</option>
          <option value="EM_ANALISE">EM_ANALISE</option>
          <option value="APROVADA">APROVADA</option>
          <option value="REPROVADA">REPROVADA</option>
          <option value="FINALIZADA">FINALIZADA</option>
        </select>
      </div>

      <div className="g-table-wrap">
        <table className="g-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Documento</th>
              <th>Telefone</th>
              <th>Código</th>
              <th>Descrição</th>
              <th>Compra</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={7} className="g-empty">Nenhuma garantia encontrada.</td></tr>
            )}
            {lista.map((g) => (
              <tr key={g.id}>
                <td>{g.cliente?.nome}</td>
                <td>{g.cliente?.documento}</td>
                <td>{g.cliente?.telefone}</td>
                <td>{g.produto?.codigo}</td>
                <td>{g.produto?.descricao}</td>
                <td>{g.garantia?.dataCompra ? new Date(g.garantia.dataCompra).toLocaleDateString() : "-"}</td>
                <td><Badge status={g.garantia?.status || "ABERTA"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="g-footer-tip">
        Dica: em produção, substitua o mock por uma consulta paginada no Firestore (ex.: <em>orderBy('createdAt','desc')</em> + filtros).
      </p>
    </div>
  );
}
