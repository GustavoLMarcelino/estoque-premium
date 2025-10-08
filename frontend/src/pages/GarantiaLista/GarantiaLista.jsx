// src/pages/GarantiaLista/GarantiaLista.jsx
import React, { useMemo, useState, useEffect } from "react";
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
  <span className={`g-badge g-badge--${String(status || "").toLowerCase().replace(/_/g, "-")}`}>
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
                <td>
                  {g.garantia?.dataCompra
                    ? (g.garantia.dataCompra.includes("-")
                        ? toPtBR(g.garantia.dataCompra)
                        : g.garantia.dataCompra)
                    : "-"}
                </td>
                <td><Badge status={g.garantia?.status || "ABERTA"} /></td>
                <td>
                  <Button
                    variant="ghost"
                    onClick={() => { setSelected(g); setEditando(false); }}
                  >
                    Ver
                  </Button>
                  <Button onClick={() => { setSelected(g); setEditando(true); }}>
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pop-up */}
      {selected && (
        <div className="popup-overlay">
          <div className="popup-card popup-wide">
            <h2>Garantia #{selected.id} {editando ? "— Editar" : "— Detalhes"}</h2>

            {/* Dados Cliente */}
            <Section title="Dados do Cliente">
              <div className="g-grid g-grid-1col">
                <Label>Nome completo</Label>
                {editando ? (
                  <Input value={form.cliente.nome} onChange={(e) => setCliente("nome", e.target.value)} />
                ) : <p>{selected.cliente?.nome}</p>}

                <Label>CPF/CNPJ</Label>
                {editando ? (
                  <Input value={form.cliente.documento} onChange={(e) => setCliente("documento", e.target.value)} />
                ) : <p>{selected.cliente?.documento}</p>}

                <Label>Telefone</Label>
                {editando ? (
                  <Input value={form.cliente.telefone} onChange={(e) => setCliente("telefone", e.target.value)} />
                ) : <p>{selected.cliente?.telefone}</p>}

                <Label>Endereço</Label>
                {editando ? (
                  <Input value={form.cliente.endereco} onChange={(e) => setCliente("endereco", e.target.value)} />
                ) : <p>{selected.cliente?.endereco}</p>}
              </div>
            </Section>

            {/* Produto e Garantia */}
            <Section title="Produto e Garantia">
              <div className="g-grid g-grid-1col">
                <Label>Código</Label>
                {editando ? (
                  <Input value={form.produto.codigo} onChange={(e) => setProduto("codigo", e.target.value)} />
                ) : <p>{selected.produto?.codigo}</p>}

                <Label>Descrição</Label>
                {editando ? (
                  <Input value={form.produto.descricao} onChange={(e) => setProduto("descricao", e.target.value)} />
                ) : <p>{selected.produto?.descricao}</p>}

                <Label>Data da compra</Label>
                {editando ? (
                  <Input
                    type="date"
                    value={form.garantia.dataCompra}
                    onChange={(e) => setGarantia("dataCompra", e.target.value)}
                  />
                ) : <p>{toPtBR(selected.garantia?.dataCompra)}</p>}

                <Label>Status</Label>
                {editando ? (
                  <Select
                    value={form.garantia.status}
                    onChange={(e) => setGarantia("status", e.target.value)}
                  >
                    <option value="ABERTA">ABERTA</option>
                    <option value="EM_ANALISE">EM_ANALISE</option>
                    <option value="APROVADA">APROVADA</option>
                    <option value="REPROVADA">REPROVADA</option>
                    <option value="FINALIZADA">FINALIZADA</option>
                  </Select>
                ) : <p>{selected.garantia?.status}</p>}

                <Label>Descrição do problema</Label>
                {editando ? (
                  <textarea
                    className="g-textarea"
                    value={form.garantia.descricaoProblema}
                    onChange={(e) => setGarantia("descricaoProblema", e.target.value)}
                  />
                ) : <p>{selected.garantia?.descricaoProblema}</p>}
              </div>
            </Section>

            {/* Anexos */}
            <Section title="Fotos / Anexos">
              {editando ? (
                <>
                  <input type="file" multiple onChange={handleFiles} />
                  {form.garantia.fotos?.length > 0 && (
                    <div className="g-files">
                      {form.garantia.fotos.map((url, i) => (
                        <div key={i} className="g-file-item">{url}</div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <ul>
                  {(selected.garantia?.fotos || []).map((f, i) => (
                    <li key={i}><a href={f} target="_blank" rel="noreferrer">Foto {i + 1}</a></li>
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
              {editando && <Button onClick={handleSave}>Salvar alterações</Button>}
              <Button variant="ghost" onClick={() => setSelected(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
