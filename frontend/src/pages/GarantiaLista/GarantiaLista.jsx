// src/pages/GarantiaLista/GarantiaLista.jsx
import React, { useMemo, useState } from "react";
import "./GarantiaLista.css";
import { fakeDb } from "../Garantia/GarantiaCadastro";

/* ===== UI ===== */
const Section = ({ title, children }) => (
  <div className="g-section">
    <h3 className="g-section__title">{title}</h3>
    {children}
  </div>
);
const Label = ({ children }) => <label className="g-label">{children}</label>;
const Input = (p) => <input {...p} className={`g-input ${p.className || ""}`} />;
const Select = (p) => <select {...p} className={`g-input ${p.className || ""}`} />;
const Button = ({ children, variant = "primary", ...rest }) => (
  <button {...rest} className={`g-btn g-btn--${variant} ${rest.className || ""}`}>
    {children}
  </button>
);

const Badge = ({ status }) => (
  <span className={`g-badge g-badge--${String(status || "").toLowerCase()}`}>
    {status}
  </span>
);

export default function GarantiasLista() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("TODOS");
  const [selected, setSelected] = useState(null);
  const [editando, setEditando] = useState(false);

  const lista = useMemo(() => {
    const garantias = (fakeDb?.garantias) ?? [];
    return garantias.filter((g) => {
      const txt =
        (g.cliente?.nome || "") +
        " " +
        (g.produto?.codigo || "") +
        " " +
        (g.produto?.descricao || "");
      const okBusca = txt.toLowerCase().includes(busca.toLowerCase());
      const okStatus = status === "TODOS" ? true : (g.garantia?.status || "") === status;
      return okBusca && okStatus;
    });
  }, [busca, status]);

  return (
    <div className="garantia-container">
      <h1 className="g-title">Garantias - Consulta</h1>

      {/* Toolbar */}
      <div className="g-list-toolbar">
        <Input
          placeholder="Buscar cliente, código ou descrição..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="TODOS">Todos</option>
          <option value="ABERTA">ABERTA</option>
          <option value="EM_ANALISE">EM_ANALISE</option>
          <option value="APROVADA">APROVADA</option>
          <option value="REPROVADA">REPROVADA</option>
          <option value="FINALIZADA">FINALIZADA</option>
        </Select>
      </div>

      {/* Tabela */}
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
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={8} className="g-empty">Nenhuma garantia encontrada.</td>
              </tr>
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
                <td>
                  <Button variant="ghost" onClick={() => { setSelected(g); setEditando(false); }}>Ver</Button>
                  <Button onClick={() => { setSelected(g); setEditando(true); }}>Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pop-up estilo cadastro */}
      {selected && (
        <div className="popup-overlay">
          <div className="popup-card popup-wide">
            <h2>Garantia #{selected.id} {editando ? "— Editar" : "— Detalhes"}</h2>

            {/* Dados Cliente */}
            <Section title="Dados do Cliente">
              <div className="g-grid g-grid-1col">
                <Label>Nome completo</Label>
                {editando ? <Input defaultValue={selected.cliente?.nome} /> : <p>{selected.cliente?.nome}</p>}

                <Label>CPF/CNPJ</Label>
                {editando ? <Input defaultValue={selected.cliente?.documento} /> : <p>{selected.cliente?.documento}</p>}

                <Label>Telefone</Label>
                {editando ? <Input defaultValue={selected.cliente?.telefone} /> : <p>{selected.cliente?.telefone}</p>}

                <Label>Endereço</Label>
                {editando ? <Input defaultValue={selected.cliente?.endereco} /> : <p>{selected.cliente?.endereco}</p>}
              </div>
            </Section>

            {/* Produto e Garantia */}
            <Section title="Produto e Garantia">
              <div className="g-grid g-grid-1col">
                <Label>Código</Label>
                {editando ? <Input defaultValue={selected.produto?.codigo} /> : <p>{selected.produto?.codigo}</p>}

                <Label>Descrição</Label>
                {editando ? <Input defaultValue={selected.produto?.descricao} /> : <p>{selected.produto?.descricao}</p>}

                <Label>Data da compra</Label>
                {editando ? (
                  <Input type="date" defaultValue={selected.garantia?.dataCompra?.slice(0,10)} />
                ) : <p>{selected.garantia?.dataCompra}</p>}

                <Label>Status</Label>
                {editando ? (
                  <Select defaultValue={selected.garantia?.status}>
                    <option value="ABERTA">ABERTA</option>
                    <option value="EM_ANALISE">EM ANÁLISE</option>
                    <option value="APROVADA">APROVADA</option>
                    <option value="REPROVADA">REPROVADA</option>
                    <option value="FINALIZADA">FINALIZADA</option>
                  </Select>
                ) : <p>{selected.garantia?.status}</p>}

                <Label>Descrição do problema</Label>
                {editando ? (
                  <textarea className="g-textarea" defaultValue={selected.garantia?.descricaoProblema}></textarea>
                ) : <p>{selected.garantia?.descricaoProblema}</p>}
              </div>
            </Section>

            {/* Anexos */}
            <Section title="Fotos / Anexos">
              {editando ? (
                <>
                  <input type="file" multiple />
                  {selected.garantia?.fotos?.length > 0 && (
                    <div className="g-files">
                      {selected.garantia.fotos.map((url, i) => (
                        <div key={i} className="g-file-item">{url}</div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <ul>
                  {(selected.garantia?.fotos || []).map((f, i) => (
                    <li key={i}><a href={f} target="_blank" rel="noreferrer">Foto {i+1}</a></li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Empréstimo */}
            <Section title="Empréstimo durante a Garantia">
              {selected.emprestimo?.ativo ? (
                <p>
                  Produto emprestado: <b>{selected.emprestimo.produtoCodigo}</b> — Qtd: {selected.emprestimo.quantidade}
                </p>
              ) : (
                <p>Nenhum empréstimo registrado.</p>
              )}
            </Section>

            <div className="popup-actions">
              {editando && <Button>Salvar alterações</Button>}
              <Button variant="ghost" onClick={() => setSelected(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
