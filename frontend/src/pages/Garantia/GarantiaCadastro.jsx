import React, { useMemo, useState } from "react";
import "./GarantiaCadastro.css";
import { GarantiasAPI } from "../../services/garantias";

/* ===== Helpers ===== */
const onlyDigits = (s = "") => (s || "").replace(/\D+/g, "");
const maskPhoneBR = (v) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").trim();
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").trim();
};
const isValidCPF = (raw) => {
  const cpf = onlyDigits(raw);
  if (!cpf || cpf.length !== 11 || /^([0-9])\1+$/.test(cpf)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let r = 11 - (s % 11); if (r >= 10) r = 0; if (r !== parseInt(cpf[9])) return false;
  s = 0; for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  r = 11 - (s % 11); if (r >= 10) r = 0; return r === parseInt(cpf[10]);
};
const isValidCNPJ = (raw) => {
  const cnpj = onlyDigits(raw);
  if (!cnpj || cnpj.length !== 14 || /^([0-9])\1+$/.test(cnpj)) return false;
  let len = 12, nums = cnpj.substring(0, len), digs = cnpj.substring(len), sum = 0, pos = len - 7;
  for (let i = len; i >= 1; i--) { sum += nums[len - i] * pos--; if (pos < 2) pos = 9; }
  let res = sum % 11 < 2 ? 0 : 11 - (sum % 11); if (res !== parseInt(digs[0])) return false;
  len++; nums = cnpj.substring(0, len); sum = 0; pos = len - 7;
  for (let i = len; i >= 1; i--) { sum += nums[len - i] * pos--; if (pos < 2) pos = 9; }
  res = sum % 11 < 2 ? 0 : 11 - (sum % 11); return res === parseInt(digs[1]);
};
const isValidCpfCnpj = (doc) => (onlyDigits(doc).length <= 11 ? isValidCPF(doc) : isValidCNPJ(doc));

const Section = ({ title, children }) => (<div className="g-section"><h3 className="g-section__title">{title}</h3>{children}</div>);
const Label = ({ children }) => <label className="g-label">{children}</label>;
const Input = (p) => <input {...p} className={`g-input ${p.className || ""}`} />;
const Select = (p) => <select {...p} className={`g-input ${p.className || ""}`} />;
const Button = ({ children, variant = "primary", ...rest }) => (
  <button {...rest} className={`g-btn g-btn--${variant} ${rest.className || ""}`}>{children}</button>
);

export default function GarantiaCadastro() {
  // Cliente
  const [clienteNome, setClienteNome] = useState("");
  const [clienteDoc, setClienteDoc] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [clienteEndereco, setClienteEndereco] = useState("");

  // Garantia
  const [dataAbertura] = useState(() => new Date());
  const [dataLimite, setDataLimite] = useState(() => new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  const [descricaoProblema, setDescricaoProblema] = useState("");
  const [dataCompra, setDataCompra] = useState("");
  const [status, setStatus] = useState("ABERTA");

  // Produto
  const [produtoCodigo, setProdutoCodigo] = useState("");
  const [produtoDescricao, setProdutoDescricao] = useState("");

  // Empréstimo
  const [emprestimoAtivo, setEmprestimoAtivo] = useState(false);
  const [emprestimoProdutoCodigo, setEmprestimoProdutoCodigo] = useState("");
  const [emprestimoQtd, setEmprestimoQtd] = useState(1);

  // Uploads (mockados no front, não salvamos no banco)
  const [fotos, setFotos] = useState([]);
  const [fotoUrls, setFotoUrls] = useState([]);

  const [saving, setSaving] = useState(false);
  const [garantiaId, setGarantiaId] = useState(null);

  const canSalvar = useMemo(() => {
    return (
      clienteNome.trim().length >= 3 &&
      isValidCpfCnpj(clienteDoc) &&
      onlyDigits(clienteTelefone).length >= 10 &&
      clienteEndereco.trim().length >= 5 &&
      produtoCodigo.trim().length > 0 &&
      produtoDescricao.trim().length > 0 &&
      dataCompra
    );
  }, [clienteNome, clienteDoc, clienteTelefone, clienteEndereco, produtoCodigo, produtoDescricao, dataCompra]);

  const whatsappMsg = useMemo(() => {
    const prazo = new Date(dataLimite).toLocaleDateString();
    const linhas = [
      `Olá ${clienteNome}, aqui é da Premium Baterias.`,
      `Registramos sua garantia hoje (${new Date(dataAbertura).toLocaleDateString()}).`,
      `Produto: ${produtoCodigo} - ${produtoDescricao}`,
      dataCompra ? `Data da compra: ${new Date(dataCompra).toLocaleDateString()}` : null,
      `Prazo estimado: até ${prazo}.`,
      `Assim que houver atualização, avisaremos por aqui. Obrigado!`,
    ].filter(Boolean);
    return encodeURIComponent(linhas.join("\n"));
  }, [clienteNome, dataAbertura, dataLimite, produtoCodigo, produtoDescricao, dataCompra]);

  const whatsappHref = useMemo(() => {
    const phone = onlyDigits(clienteTelefone);
    if (!phone) return "#";
    return `https://wa.me/55${phone}?text=${whatsappMsg}`;
  }, [clienteTelefone, whatsappMsg]);

  async function salvarGarantia() {
    if (!canSalvar) return;
    setSaving(true);
    try {
      // (uploads apenas locais)
      const urls = fotos?.map((f) => URL.createObjectURL(f)) ?? [];
      setFotoUrls(urls);

      const payload = {
        cliente: {
          nome: clienteNome.trim(),
          documento: onlyDigits(clienteDoc),
          telefone: onlyDigits(clienteTelefone),
          endereco: clienteEndereco.trim(),
        },
        produto: {
          codigo: produtoCodigo.trim(),
          descricao: produtoDescricao.trim(),
        },
        garantia: {
          dataAbertura: new Date().toISOString(),
          dataLimite: new Date(dataLimite).toISOString(),
          dataCompra: dataCompra ? new Date(dataCompra).toISOString() : null,
          status,
          descricaoProblema: descricaoProblema.trim(),
        },
        emprestimo: emprestimoAtivo
          ? { ativo: true, produtoCodigo: emprestimoProdutoCodigo.trim(), quantidade: Number(emprestimoQtd) || 1 }
          : { ativo: false },
      };

      const { id } = await GarantiasAPI.criar(payload);
      setGarantiaId(id);
      alert("Garantia salva com sucesso!");
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.message || "Falha ao salvar garantia.");
    } finally {
      setSaving(false);
    }
  }

  async function finalizarGarantia() {
    if (!garantiaId) return alert("Salve a garantia antes de finalizar.");
    alert("Função de finalizar pode chamar um PATCH /garantias/:id no backend (implementar quando quiser).");
  }

  function imprimirTermo() {
    const win = window.open("", "_blank");
    const dataHoje = new Date().toLocaleDateString();
    const bloco = (via) => `
      <div class="term-block">
        <h2>Comprovante de Empréstimo — ${via} via</h2>
        <p class="term-date">Data: ${dataHoje}</p>
        <hr/>
        <p><strong>Cliente:</strong> ${clienteNome} — Doc: ${clienteDoc}</p>
        <p><strong>Telefone:</strong> ${clienteTelefone}</p>
        <p><strong>Endereço:</strong> ${clienteEndereco}</p>
        <p><strong>Produto:</strong> ${produtoCodigo} — ${produtoDescricao}</p>
        ${dataCompra ? `<p><strong>Compra:</strong> ${new Date(dataCompra).toLocaleDateString()}</p>` : ""}
        ${emprestimoAtivo ? `<p><strong>Empréstimo:</strong> ${emprestimoProdutoCodigo} — Qtd: ${emprestimoQtd}</p>` : ""}
        <p class="term-text">
          Declaro estar ciente de que devo devolver a bateria emprestada em perfeitas condições no ato da retirada
          do meu produto em garantia. Após notificação, tenho 60 (sessenta) dias corridos para retirada do item,
          sob pena de descarte ou destinação conforme política da loja.
        </p>
        <div class="term-signs">
          <div class="sign">Assinatura do Cliente</div>
          <div class="sign">Responsável — Premium Baterias</div>
        </div>
      </div>
    `;
    win.document.write(`
      <html><head><title>Termo de Empréstimo</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { display:flex; gap: 16px; font-family: Arial, Helvetica, sans-serif; }
        .term-block{ width:48%; border:1px solid #ccc; border-radius:10px; padding:12px; }
        .term-block h2{ margin:0 0 8px 0; font-size:18px; }
        .term-date{ margin:4px 0; font-size:12px; }
        .term-text{ margin:10px 0; font-size:13px; line-height:1.4; }
        .term-signs{ margin-top:18px; display:flex; justify-content:space-between; gap:10px; }
        .sign{ width:49%; text-align:center; border-top:1px solid #333; padding-top:6px; font-size:13px; }
      </style>
      </head><body>
        ${bloco("1ª")}
        ${bloco("2ª")}
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="garantia-container">
      <h1 className="g-title">Garantia - Cadastro</h1>

      <div className="g-grid g-grid-3cols">
        <div className="g-col-2">
          <Section title="Dados do Cliente">
            <div className="g-grid g-grid-2cols">
              <div>
                <Label>Nome completo *</Label>
                <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Ex.: João da Silva" />
              </div>
              <div>
                <Label>CPF/CNPJ *</Label>
                <Input value={clienteDoc} onChange={(e) => setClienteDoc(e.target.value)} placeholder="___.___.___-__ / __.___.___/____-__" />
                {clienteDoc && !isValidCpfCnpj(clienteDoc) && <span className="g-error">Documento inválido</span>}
              </div>
              <div>
                <Label>Telefone (WhatsApp) *</Label>
                <Input value={clienteTelefone} onChange={(e) => setClienteTelefone(maskPhoneBR(e.target.value))} placeholder="(47) 9 9999-9999" />
              </div>
              <div className="g-col-span-2">
                <Label>Endereço *</Label>
                <Input value={clienteEndereco} onChange={(e) => setClienteEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade/UF" />
              </div>
            </div>
          </Section>

          <Section title="Produto e Garantia">
            <div className="g-grid g-grid-3cols">
              <div>
                <Label>Código da bateria *</Label>
                <Input value={produtoCodigo} onChange={(e) => setProdutoCodigo(e.target.value)} placeholder="Ex.: 60Ah-12V" />
              </div>
              <div className="g-col-span-2">
                <Label>Descrição do produto *</Label>
                <Input value={produtoDescricao} onChange={(e) => setProdutoDescricao(e.target.value)} placeholder="Marca/Modelo/Especificação" />
                {!produtoDescricao && <span className="g-error">Obrigatório</span>}
              </div>

              <div>
                <Label>Data de abertura</Label>
                <Input value={new Date(dataAbertura).toLocaleDateString()} disabled />
              </div>
              <div>
                <Label>Data limite *</Label>
                <Input type="date" value={dataLimite} onChange={(e) => setDataLimite(e.target.value)} />
              </div>
              <div>
                <Label>Data da compra *</Label>
                <Input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} />
                {!dataCompra && <span className="g-error">Obrigatório</span>}
              </div>

              <div>
                <Label>Status</Label>
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="ABERTA">ABERTA</option>
                  <option value="EM_ANALISE">EM ANÁLISE</option>
                  <option value="APROVADA">APROVADA</option>
                  <option value="REPROVADA">REPROVADA</option>
                  <option value="FINALIZADA">FINALIZADA</option>
                </Select>
              </div>
              <div className="g-col-span-2">
                <Label>Descrição do problema</Label>
                <textarea className="g-textarea" rows={4} value={descricaoProblema} onChange={(e) => setDescricaoProblema(e.target.value)} placeholder="Relato do cliente, testes realizados, etc." />
              </div>
            </div>
          </Section>

          <Section title="Fotos / Anexos">
            <div className="g-uploads">
              <input type="file" accept="image/*" multiple onChange={(e) => setFotos(Array.from(e.target.files || []))} />
              {fotoUrls?.length > 0 && <span className="g-note">{fotoUrls.length} foto(s) enviada(s)</span>}
            </div>
            {fotos?.length > 0 && (
              <div className="g-files">
                {fotos.map((f, i) => (<div key={i} className="g-file-item" title={f.name}>{f.name}</div>))}
              </div>
            )}
          </Section>
        </div>

        <div>
          <Section title="Empréstimo durante a Garantia">
            <div className="g-checkbox-row">
              <input id="emprestimo" type="checkbox" checked={emprestimoAtivo} onChange={(e) => setEmprestimoAtivo(e.target.checked)} />
              <label htmlFor="emprestimo">Houve empréstimo de bateria?</label>
            </div>
            {emprestimoAtivo && (
              <div className="g-grid">
                <div>
                  <Label>Código do produto emprestado</Label>
                  <Input value={emprestimoProdutoCodigo} onChange={(e) => setEmprestimoProdutoCodigo(e.target.value)} placeholder="Ex.: 60Ah-12V" />
                </div>
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" min={1} value={emprestimoQtd} onChange={(e) => setEmprestimoQtd(e.target.value)} />
                </div>
                <p className="g-help">Ao salvar, será registrada uma <strong>saída</strong> no estoque com motivo "Empréstimo Garantia".</p>
              </div>
            )}
          </Section>

          <Section title="Ações">
            <div className="g-actions">
              <Button onClick={salvarGarantia} disabled={!canSalvar || saving}>
                {saving ? "Salvando..." : garantiaId ? "Salvar alterações" : "Salvar garantia"}
              </Button>
              <a href={whatsappHref} target="_blank" rel="noreferrer" className="g-link-reset">
                <Button variant="success" className="g-btn-full">Abrir WhatsApp do cliente</Button>
              </a>
              <Button variant="ghost" onClick={imprimirTermo}>Imprimir termo (2 vias)</Button>
              <Button variant="danger" onClick={finalizarGarantia}>Finalizar garantia</Button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
