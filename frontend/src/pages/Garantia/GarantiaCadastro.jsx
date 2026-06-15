import React, { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Shield, User, CreditCard, Phone, MapPin, Hash, FileText,
  Calendar, DollarSign, Battery, Save, MessageCircle,
  Printer, CheckCircle, Upload, Loader2, AlertCircle,
} from "lucide-react";
import { GarantiasAPI } from "../../services/garantias";

/* ===== Helpers (unchanged) ===== */
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

/* ===== Status config ===== */
const STATUS_OPTIONS = [
  {
    value: "ABERTA",
    label: "Aberta",
    active: "bg-blue-500 text-white shadow-sm",
    inactive: "border border-blue-300 text-blue-600 hover:bg-blue-50",
  },
  {
    value: "EM_ANALISE",
    label: "Em Análise",
    active: "bg-amber-400 text-slate-900 shadow-sm",
    inactive: "border border-amber-300 text-amber-600 hover:bg-amber-50",
  },
  {
    value: "APROVADA",
    label: "Aprovada",
    active: "bg-emerald-500 text-white shadow-sm",
    inactive: "border border-emerald-300 text-emerald-600 hover:bg-emerald-50",
  },
  {
    value: "REPROVADA",
    label: "Reprovada",
    active: "bg-red-500 text-white shadow-sm",
    inactive: "border border-red-300 text-red-600 hover:bg-red-50",
  },
  {
    value: "FINALIZADA",
    label: "Finalizada",
    active: "bg-slate-600 text-white shadow-sm",
    inactive: "border border-slate-300 text-slate-600 hover:bg-slate-50",
  },
];

/* ===== Input class helper ===== */
const inputCls = "w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 disabled:bg-slate-50 disabled:text-slate-400";

export default function GarantiaCadastro() {
  const { id: idParam } = useParams();
  const [searchParams] = useSearchParams();
  const garantiaIdParam = idParam || searchParams.get("id");
  const fileInputRef = useRef(null);

  /* --- Cliente --- */
  const [clienteNome, setClienteNome] = useState("");
  const [clienteDoc, setClienteDoc] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [clienteEndereco, setClienteEndereco] = useState("");

  /* --- Garantia --- */
  const [dataAbertura, setDataAbertura] = useState(() => new Date());
  const [dataLimite, setDataLimite] = useState(() => new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  const [descricaoProblema, setDescricaoProblema] = useState("");
  const [dataCompra, setDataCompra] = useState("");
  const [status, setStatus] = useState("ABERTA");

  /* --- Produto --- */
  const [produtoCodigo, setProdutoCodigo] = useState("");
  const [produtoDescricao, setProdutoDescricao] = useState("");
  const [produtoValor, setProdutoValor] = useState("");

  /* --- Empréstimo --- */
  const [emprestimoAtivo, setEmprestimoAtivo] = useState(false);
  const [emprestimoProdutoCodigo, setEmprestimoProdutoCodigo] = useState("");
  const [emprestimoQtd, setEmprestimoQtd] = useState(1);

  /* --- Observações internas --- */
  const [observacoesInternas, setObservacoesInternas] = useState("");

  /* --- Uploads --- */
  const [fotos, setFotos] = useState([]);
  const [fotoUrls, setFotoUrls] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  /* --- Meta --- */
  const [saving, setSaving] = useState(false);
  const [garantiaId, setGarantiaId] = useState(null);
  const [carregandoGarantia, setCarregandoGarantia] = useState(false);

  /* ===== Derived (unchanged) ===== */
  const canSalvar = useMemo(() => {
    return (
      clienteNome.trim().length >= 3 &&
      isValidCpfCnpj(clienteDoc) &&
      onlyDigits(clienteTelefone).length >= 10 &&
      clienteEndereco.trim().length >= 5 &&
      produtoCodigo.trim().length > 0 &&
      produtoDescricao.trim().length > 0 &&
      dataCompra &&
      !carregandoGarantia
    );
  }, [clienteNome, clienteDoc, clienteTelefone, clienteEndereco, produtoCodigo, produtoDescricao, dataCompra, carregandoGarantia]);

  const whatsappMsg = useMemo(() => {
    const prazo = new Date(dataLimite).toLocaleDateString();
    const linhas = [
      `Ola ${clienteNome}, aqui e da Premium Baterias.`,
      `Registramos sua garantia hoje (${new Date(dataAbertura).toLocaleDateString()}).`,
      `Produto: ${produtoCodigo} - ${produtoDescricao}`,
      dataCompra ? `Data da compra: ${new Date(dataCompra).toLocaleDateString()}` : null,
      `Prazo estimado: ate ${prazo}.`,
      `Assim que houver atualizacao, avisaremos por aqui. Obrigado!`,
    ].filter(Boolean);
    return encodeURIComponent(linhas.join("\n"));
  }, [clienteNome, dataAbertura, dataLimite, produtoCodigo, produtoDescricao, dataCompra]);

  const whatsappHref = useMemo(() => {
    const phone = onlyDigits(clienteTelefone);
    if (!phone) return "#";
    return `https://wa.me/55${phone}?text=${whatsappMsg}`;
  }, [clienteTelefone, whatsappMsg]);

  /* ===== Load existing garantia (unchanged + new fields) ===== */
  useEffect(() => {
    if (!garantiaIdParam) return;
    let alive = true;
    setCarregandoGarantia(true);
    (async () => {
      try {
        const g = await GarantiasAPI.obter(garantiaIdParam);
        if (!alive) return;

        setClienteNome(g?.cliente_nome || "");
        setClienteDoc(g?.cliente_documento || "");
        setClienteTelefone(maskPhoneBR(g?.cliente_telefone || ""));
        setClienteEndereco(g?.cliente_endereco || "");

        setProdutoCodigo(g?.produto_codigo || "");
        setProdutoDescricao(g?.produto_descricao || "");
        setProdutoValor(g?.produto_valor ? String(g.produto_valor) : "");

        setDataAbertura(g?.data_abertura ? new Date(g.data_abertura) : new Date());
        setDataLimite(g?.data_limite ? new Date(g.data_limite).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
        setDataCompra(g?.data_compra ? new Date(g.data_compra).toISOString().slice(0, 10) : "");
        setStatus(g?.status || "ABERTA");
        setDescricaoProblema(g?.descricao_problema || "");
        setObservacoesInternas(g?.observacoes_internas || "");

        setGarantiaId(g?.id || null);
      } catch (e) {
        console.error(e);
        if (alive) alert(e?.response?.data?.message || "Falha ao carregar garantia.");
      } finally {
        if (alive) setCarregandoGarantia(false);
      }
    })();
    return () => { alive = false; };
  }, [garantiaIdParam]);

  /* ===== Actions (unchanged logic, payload extended) ===== */
  async function salvarGarantia() {
    if (!canSalvar) return;
    setSaving(true);
    try {
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
          valor: Number(produtoValor) || null,
        },
        garantia: {
          dataAbertura: new Date(dataAbertura).toISOString(),
          dataLimite: new Date(dataLimite).toISOString(),
          dataCompra: dataCompra ? new Date(dataCompra).toISOString() : null,
          status,
          descricaoProblema: descricaoProblema.trim(),
          observacoesInternas: observacoesInternas.trim() || null,
        },
        emprestimo: emprestimoAtivo
          ? { ativo: true, produtoCodigo: emprestimoProdutoCodigo.trim(), quantidade: Number(emprestimoQtd) || 1 }
          : { ativo: false },
      };

      const response = garantiaId
        ? await GarantiasAPI.atualizar(garantiaId, payload)
        : await GarantiasAPI.criar(payload);

      setGarantiaId(response?.id ?? garantiaId ?? null);
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
    alert("Finalizar ainda nao foi implementado. Podera chamar um PATCH /garantias/:id no backend.");
  }

  function imprimirTermo() {
    const win = window.open("", "_blank");
    const dataHoje = new Date().toLocaleDateString();
    const bloco = (via) => `
      <div class="term-block">
        <h2>Comprovante de Emprestimo - ${via} via</h2>
        <p class="term-date">Data: ${dataHoje}</p>
        <hr/>
        <p><strong>Cliente:</strong> ${clienteNome} - Doc: ${clienteDoc}</p>
        <p><strong>Telefone:</strong> ${clienteTelefone}</p>
        <p><strong>Endereco:</strong> ${clienteEndereco}</p>
        <p><strong>Produto:</strong> ${produtoCodigo} - ${produtoDescricao}</p>
        ${dataCompra ? `<p><strong>Compra:</strong> ${new Date(dataCompra).toLocaleDateString()}</p>` : ""}
        ${emprestimoAtivo ? `<p><strong>Emprestimo:</strong> ${emprestimoProdutoCodigo} - Qtd: ${emprestimoQtd}</p>` : ""}
        <p class="term-text">
          Declaro estar ciente de que devo devolver a bateria emprestada em perfeitas condicoes no ato da retirada
          do meu produto em garantia. Apos notificacao, tenho 60 (sessenta) dias corridos para retirada do item,
          sob pena de descarte ou destinacao conforme politica da loja.
        </p>
        <div class="term-signs">
          <div class="sign">Assinatura do Cliente</div>
          <div class="sign">Responsavel - Premium Baterias</div>
        </div>
      </div>
    `;
    win.document.write(`
      <html><head><title>Termo de Emprestimo</title>
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
        ${bloco("1a")}
        ${bloco("2a")}
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  /* ===== Upload handlers ===== */
  function handleFiles(files) {
    const imgs = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setFotos(imgs);
  }

  /* ===== Render ===== */
  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">

      {/* Page header */}
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
          <Shield size={24} strokeWidth={2.2} />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-800 md:text-2xl">
            {garantiaId ? "Edição de Garantia" : "Cadastro de Garantia"}
          </h1>
          <p className="text-sm text-slate-500">Registre uma nova garantia para o cliente</p>
        </div>
      </div>

      {carregandoGarantia && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <Loader2 size={15} className="animate-spin" />
          Carregando dados da garantia...
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* ── Main (2 cols) ── */}
        <div className="space-y-5 lg:col-span-2">

          {/* Dados do Cliente */}
          <Card title="Dados do Cliente">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <GField label="Nome completo *" icon={User}
                value={clienteNome} onChange={(e) => setClienteNome(e.target.value)}
                placeholder="Ex.: João da Silva" />

              <div>
                <GField label="CPF / CNPJ *" icon={CreditCard}
                  value={clienteDoc} onChange={(e) => setClienteDoc(e.target.value)}
                  placeholder="___.___.___-__ / __.___.___/____-__" />
                {clienteDoc && !isValidCpfCnpj(clienteDoc) && (
                  <p className="mt-1 text-xs text-red-600">Documento inválido</p>
                )}
              </div>

              <GField label="Telefone (WhatsApp) *" icon={Phone}
                value={clienteTelefone}
                onChange={(e) => setClienteTelefone(maskPhoneBR(e.target.value))}
                placeholder="(47) 9 9999-9999" />

              <div className="sm:col-span-2">
                <GField label="Endereço *" icon={MapPin}
                  value={clienteEndereco} onChange={(e) => setClienteEndereco(e.target.value)}
                  placeholder="Rua, número, bairro, cidade/UF" />
              </div>
            </div>
          </Card>

          {/* Produto e Garantia */}
          <Card title="Produto e Garantia">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <GField label="Código da bateria *" icon={Hash}
                value={produtoCodigo} onChange={(e) => setProdutoCodigo(e.target.value)}
                placeholder="Ex.: 60Ah-12V" />

              <GField label="Descrição do produto *" icon={FileText}
                value={produtoDescricao} onChange={(e) => setProdutoDescricao(e.target.value)}
                placeholder="Marca / Modelo / Especificação" />

              <GField label="Valor da bateria (R$)" icon={DollarSign}
                type="number" step="0.01" min="0"
                value={produtoValor} onChange={(e) => setProdutoValor(e.target.value)}
                placeholder="0,00" />

              <GField label="Data de abertura" icon={Calendar}
                value={new Date(dataAbertura).toLocaleDateString()} disabled />

              <GField label="Data limite *" icon={Calendar}
                type="date" value={dataLimite} onChange={(e) => setDataLimite(e.target.value)} />

              <div>
                <GField label="Data da compra *" icon={Calendar}
                  type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} />
                {!dataCompra && (
                  <p className="mt-1 text-xs text-red-600">Obrigatório</p>
                )}
              </div>

              {/* Status pills */}
              <div className="sm:col-span-2">
                <div className="mb-2 flex items-center gap-1.5">
                  <AlertCircle size={14} className="text-slate-400" />
                  <span className="text-xs font-medium text-slate-600">Status</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                        status === opt.value ? opt.active : opt.inactive
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descrição do problema */}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Descrição do problema
                </label>
                <div className="relative">
                  <FileText size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                  <textarea
                    rows={4}
                    value={descricaoProblema}
                    onChange={(e) => setDescricaoProblema(e.target.value)}
                    placeholder="Relato do cliente, testes realizados, etc."
                    className="w-full resize-vertical rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Observações Internas */}
          <Card title="Observações Internas">
            <p className="mb-3 text-xs text-slate-400">
              Visível apenas para a equipe. Não é impresso no termo de garantia.
            </p>
            <textarea
              rows={3}
              value={observacoesInternas}
              onChange={(e) => setObservacoesInternas(e.target.value)}
              placeholder="Anotações internas, histórico de contato, observações técnicas..."
              className="w-full resize-vertical rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </Card>

          {/* Fotos / Anexos */}
          <Card title="Fotos / Anexos">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 transition-colors ${
                dragOver
                  ? "border-amber-400 bg-amber-50"
                  : "border-slate-300 hover:border-amber-300 hover:bg-amber-50/40"
              }`}
            >
              <Upload size={28} strokeWidth={1.6} className={dragOver ? "text-amber-500" : "text-slate-400"} />
              <p className="text-sm font-medium text-slate-600">
                Clique ou arraste imagens aqui
              </p>
              <p className="text-xs text-slate-400">JPG, PNG, WEBP aceitos</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {fotos.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold text-slate-500">
                  {fotos.length} arquivo{fotos.length !== 1 ? "s" : ""} selecionado{fotos.length !== 1 ? "s" : ""}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {fotos.map((f, i) => (
                    <div
                      key={i}
                      title={f.name}
                      className="overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-500"
                    >
                      {f.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">

          {/* Empréstimo */}
          <Card title="Empréstimo durante a Garantia">
            <button
              type="button"
              onClick={() => setEmprestimoAtivo((v) => !v)}
              className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                emprestimoAtivo
                  ? "border-amber-400 bg-amber-50"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                emprestimoAtivo ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-400"
              }`}>
                <Battery size={18} />
              </span>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${emprestimoAtivo ? "text-amber-800" : "text-slate-700"}`}>
                  Empréstimo de bateria
                </p>
                <p className="text-xs text-slate-400">{emprestimoAtivo ? "Ativo" : "Inativo — clique para ativar"}</p>
              </div>
              {/* Toggle pill */}
              <span className={`h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                emprestimoAtivo ? "bg-amber-400" : "bg-slate-200"
              }`} />
            </button>

            {emprestimoAtivo && (
              <div className="mt-4 space-y-3">
                <GField label="Número de série da bateria emprestada" icon={Hash}
                  value={emprestimoProdutoCodigo}
                  onChange={(e) => setEmprestimoProdutoCodigo(e.target.value)}
                  placeholder="Ex.: 60Ah-12V" />

                <GField label="Quantidade" icon={Hash}
                  type="number" min={1}
                  value={emprestimoQtd}
                  onChange={(e) => setEmprestimoQtd(e.target.value)} />

                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Ao salvar, será registrada uma <strong>saída</strong> no estoque com motivo "Empréstimo Garantia".
                </p>
              </div>
            )}
          </Card>

          {/* Ações */}
          <Card title="Ações">
            <div className="flex flex-col gap-3">
              <button
                onClick={salvarGarantia}
                disabled={!canSalvar || saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? <><Loader2 size={16} className="animate-spin" /> Salvando...</>
                  : <><Save size={16} strokeWidth={2.2} /> {garantiaId ? "Salvar alterações" : "Salvar garantia"}</>
                }
              </button>

              <a href={whatsappHref} target="_blank" rel="noreferrer" className="block">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600"
                >
                  <MessageCircle size={16} strokeWidth={2.2} />
                  Abrir WhatsApp do cliente
                </button>
              </a>

              <button
                type="button"
                onClick={imprimirTermo}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                <Printer size={16} strokeWidth={2.2} />
                Imprimir termo (2 vias)
              </button>

              <button
                type="button"
                onClick={finalizarGarantia}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600"
              >
                <CheckCircle size={16} strokeWidth={2.2} />
                Finalizar garantia
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ===== Subcomponents ===== */

function Card({ title, children }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

function GField({ label, icon: Icon, className = "", ...inputProps }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <div className="relative">
        {Icon && (
          <Icon
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
        )}
        <input
          {...inputProps}
          className={inputCls}
        />
      </div>
    </div>
  );
}
