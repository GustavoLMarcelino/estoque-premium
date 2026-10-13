import React, { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Shield, User, Phone, Hash, FileText,
  Calendar, Battery, Save, MessageCircle,
  CheckCircle, Upload, Loader2, AlertCircle,
} from "lucide-react";
import { GarantiasAPI } from "../../services/garantias";
import { EstoqueAPI } from "../../services/estoque";
import { useToast } from "../../components/ui/Toast";
import DateInputBR from "../../components/ui/DateInputBR";
import { isoToBr } from "../../utils/dateBR";

/* ===== Helpers ===== */
const onlyDigits = (s = "") => (s || "").replace(/\D+/g, "");
const maskPhoneBR = (v) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").trim();
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").trim();
};
/* ===== Status config — fases físicas do processo da bateria =====
 * aguardando envio -> recolhida (fora da loja, em teste) -> em loja -> finalizada */
const STATUS_OPTIONS = [
  {
    value: "AGUARDANDO_ENVIO",
    label: "Aguardando envio",
    active: "bg-blue-500 text-white shadow-sm",
    inactive: "border border-blue-300 text-blue-600 hover:bg-blue-50",
  },
  {
    value: "RECOLHIDA",
    label: "Recolhida",
    active: "bg-amber-400 text-slate-900 shadow-sm",
    inactive: "border border-amber-300 text-amber-600 hover:bg-amber-50",
  },
  {
    value: "EM_LOJA",
    label: "Em loja",
    active: "bg-emerald-500 text-white shadow-sm",
    inactive: "border border-emerald-300 text-emerald-600 hover:bg-emerald-50",
  },
  {
    value: "FINALIZADA",
    label: "Finalizada",
    active: "bg-slate-600 text-white shadow-sm",
    inactive: "border border-slate-300 text-slate-600 hover:bg-slate-50",
  },
];

/* Resultado do teste da distribuidora, registrado quando a bateria volta (EM_LOJA). */
const RESULTADO_OPTIONS = [
  { value: "NOVA", label: "Bateria nova (troca)" },
  { value: "MESMA", label: "Mesma bateria (recarregada)" },
];

/* ===== Input class helper ===== */
const inputCls = "w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 disabled:bg-slate-50 disabled:text-slate-400";

export default function GarantiaCadastro() {
  const toast = useToast();
  const { id: idParam } = useParams();
  const [searchParams] = useSearchParams();
  const garantiaIdParam = idParam || searchParams.get("id");
  const fileInputRef = useRef(null);

  /* --- Cliente --- */
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [clienteEndereco, setClienteEndereco] = useState("");

  /* --- Garantia --- */
  const [dataAbertura, setDataAbertura] = useState(() => new Date());
  const [descricaoProblema, setDescricaoProblema] = useState("");
  const [dataCompra, setDataCompra] = useState("");
  const [status, setStatus] = useState("AGUARDANDO_ENVIO");
  const [statusSalvo, setStatusSalvo] = useState("AGUARDANDO_ENVIO"); // status persistido (gate do Finalizar)

  /* --- Resultado do teste (distribuidora) --- */
  const [resultado, setResultado] = useState(""); // NOVA | MESMA | ''

  /* --- Produto --- */
  const [produtoCodigo, setProdutoCodigo] = useState("");
  const [produtoDescricao, setProdutoDescricao] = useState("");

  /* --- Empréstimo --- */
  const [emprestimoAtivo, setEmprestimoAtivo] = useState(false);
  const [emprestimoProdutoId, setEmprestimoProdutoId] = useState(""); // FK real do estoque de baterias
  const [emprestimoQtd, setEmprestimoQtd] = useState(1);
  const [estoqueBaterias, setEstoqueBaterias] = useState([]);
  // Empréstimo já salvo no banco (edição): { produtoId, quantidade, devolvido } | null.
  // Quando pendente (não devolvido), o card vira só-leitura + botão Devolver.
  const [emprestimoSalvo, setEmprestimoSalvo] = useState(null);
  const [devolvendo, setDevolvendo] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const emprestimoTravado = !!(emprestimoSalvo && !emprestimoSalvo.devolvido);

  // catálogo de baterias para o seletor de empréstimo (fonte da baixa)
  useEffect(() => {
    EstoqueAPI.listar()
      .then((data) => setEstoqueBaterias(data ?? []))
      .catch((e) => console.error("Garantia: falha ao carregar estoque de baterias:", e));
  }, []);

  const emEstoqueDe = (p) =>
    Number(p?.em_estoque ?? (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0)));
  const emprestimoProduto = useMemo(
    () => estoqueBaterias.find((p) => String(p.id) === String(emprestimoProdutoId)) || null,
    [estoqueBaterias, emprestimoProdutoId],
  );
  const nomeProdutoEmprestimo = emprestimoProduto
    ? [emprestimoProduto.produto, emprestimoProduto.modelo].filter(Boolean).join(" — ")
    : "";

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
      onlyDigits(clienteTelefone).length >= 10 &&
      produtoCodigo.trim().length > 0 &&
      produtoDescricao.trim().length > 0 &&
      dataCompra &&
      !carregandoGarantia
    );
  }, [clienteNome, clienteTelefone, produtoCodigo, produtoDescricao, dataCompra, carregandoGarantia]);

  const whatsappMsg = useMemo(() => {
    const linhas = [
      `Ola ${clienteNome}, aqui e da Premium Baterias.`,
      `Registramos sua garantia hoje (${new Date(dataAbertura).toLocaleDateString()}).`,
      `Produto: ${produtoCodigo} - ${produtoDescricao}`,
      dataCompra ? `Data da compra: ${isoToBr(dataCompra)}` : null,
      `Assim que houver atualizacao, avisaremos por aqui. Obrigado!`,
    ].filter(Boolean);
    return encodeURIComponent(linhas.join("\n"));
  }, [clienteNome, dataAbertura, produtoCodigo, produtoDescricao, dataCompra]);

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
        setClienteTelefone(maskPhoneBR(g?.cliente_telefone || ""));
        setClienteEndereco(g?.cliente_endereco || "");

        setProdutoCodigo(g?.produto_codigo || "");
        setProdutoDescricao(g?.produto_descricao || "");

        setDataAbertura(g?.data_abertura ? new Date(g.data_abertura) : new Date());
        setDataCompra(g?.data_compra ? new Date(g.data_compra).toISOString().slice(0, 10) : "");
        setStatus(g?.status || "AGUARDANDO_ENVIO");
        setStatusSalvo(g?.status || "AGUARDANDO_ENVIO");
        setDescricaoProblema(g?.descricao_problema || "");
        setResultado(g?.resultado || "");

        // Empréstimo salvo: repovoa os campos (antes sumiam ao reabrir).
        if (g?.emprestimo_produto_id) {
          setEmprestimoSalvo({
            produtoId: g.emprestimo_produto_id,
            quantidade: g.emprestimo_quantidade ?? 1,
            devolvido: !!g.emprestimo_devolvido,
          });
          setEmprestimoProdutoId(String(g.emprestimo_produto_id));
          setEmprestimoQtd(g.emprestimo_quantidade ?? 1);
          setEmprestimoAtivo(!g.emprestimo_devolvido);
        } else {
          setEmprestimoSalvo(null);
        }

        setGarantiaId(g?.id || null);
      } catch (e) {
        console.error(e);
        if (alive) toast.error(e?.response?.data?.message || "Falha ao carregar garantia.");
      } finally {
        if (alive) setCarregandoGarantia(false);
      }
    })();
    return () => { alive = false; };
  }, [garantiaIdParam]);

  /* ===== Actions (unchanged logic, payload extended) ===== */
  async function salvarGarantia() {
    if (!canSalvar) return;
    if (!emprestimoTravado && emprestimoAtivo && !emprestimoProduto) {
      toast.error("Selecione o produto do estoque a ser emprestado.");
      return;
    }
    if (!emprestimoTravado && emprestimoAtivo && Number(emprestimoQtd) > emEstoqueDe(emprestimoProduto)) {
      toast.error(`Sem estoque suficiente. Disponível: ${emEstoqueDe(emprestimoProduto)}.`);
      return;
    }
    setSaving(true);
    try {
      const urls = fotos?.map((f) => URL.createObjectURL(f)) ?? [];
      setFotoUrls(urls);

      const payload = {
        cliente: {
          nome: clienteNome.trim(),
          telefone: onlyDigits(clienteTelefone),
          endereco: clienteEndereco.trim(),
        },
        produto: {
          codigo: produtoCodigo.trim(),
          descricao: produtoDescricao.trim(),
        },
        garantia: {
          dataAbertura: new Date(dataAbertura).toISOString(),
          dataCompra: dataCompra ? new Date(dataCompra).toISOString() : null,
          status,
          descricaoProblema: descricaoProblema.trim(),
          resultado: resultado || "",
        },
        // Empréstimo já ativo salvo é imutável aqui (devolução é pelo botão
        // Devolver / ao Finalizar). Só envia empréstimo quando não travado:
        // ativa um novo (na criação ou ao editar uma garantia sem empréstimo).
        ...(emprestimoTravado
          ? {}
          : {
              emprestimo: emprestimoAtivo
                ? { ativo: true, produto_id: Number(emprestimoProdutoId) || null, quantidade: Number(emprestimoQtd) || 1 }
                : { ativo: false },
            }),
      };

      const response = garantiaId
        ? await GarantiasAPI.atualizar(garantiaId, payload)
        : await GarantiasAPI.criar(payload);

      setGarantiaId(response?.id ?? garantiaId ?? null);
      setStatusSalvo(status);
      // Se um empréstimo novo foi ativado agora, trava o card e reflete o estoque.
      if (!emprestimoTravado && emprestimoAtivo && response?.emprestimo_produto_id) {
        setEmprestimoSalvo({
          produtoId: response.emprestimo_produto_id,
          quantidade: response.emprestimo_quantidade ?? (Number(emprestimoQtd) || 1),
          devolvido: false,
        });
        EstoqueAPI.listar().then((d) => setEstoqueBaterias(d ?? [])).catch(() => {});
      }
      toast.success("Garantia salva com sucesso!");
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.message || "Falha ao salvar garantia.");
    } finally {
      setSaving(false);
    }
  }

  // Devolução manual do empréstimo (antes de finalizar, se preciso).
  async function devolverEmprestimo() {
    if (!garantiaId || !emprestimoTravado) return;
    setDevolvendo(true);
    try {
      await GarantiasAPI.devolver(garantiaId);
      setEmprestimoSalvo((s) => (s ? { ...s, devolvido: true } : s));
      setEmprestimoAtivo(false);
      EstoqueAPI.listar().then((d) => setEstoqueBaterias(d ?? [])).catch(() => {});
      toast.success("Empréstimo devolvido ao estoque.");
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao devolver empréstimo.");
    } finally {
      setDevolvendo(false);
    }
  }

  async function finalizarGarantia() {
    if (!garantiaId) {
      toast.error("Salve a garantia antes de finalizar.");
      return;
    }
    if (statusSalvo !== "EM_LOJA") {
      toast.error("Só é possível finalizar quando a bateria estiver em loja. Salve o status \"Em loja\" antes.");
      return;
    }
    setFinalizando(true);
    try {
      await GarantiasAPI.finalizar(garantiaId);
      setStatus("FINALIZADA");
      setStatusSalvo("FINALIZADA");
      // Finalizar devolve o empréstimo pendente automaticamente.
      setEmprestimoSalvo((s) => (s && !s.devolvido ? { ...s, devolvido: true } : s));
      setEmprestimoAtivo(false);
      EstoqueAPI.listar().then((d) => setEstoqueBaterias(d ?? [])).catch(() => {});
      toast.success("Garantia finalizada.");
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao finalizar garantia.");
    } finally {
      setFinalizando(false);
    }
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

              <GField label="Telefone (WhatsApp) *" icon={Phone}
                value={clienteTelefone}
                onChange={(e) => setClienteTelefone(maskPhoneBR(e.target.value))}
                placeholder="(47) 9 9999-9999" />
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

              <GField label="Data de abertura" icon={Calendar}
                value={new Date(dataAbertura).toLocaleDateString()} disabled />

              <DateInputBR label="Data da compra *" icon={Calendar} required
                value={dataCompra} onChange={setDataCompra} />

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

          {/* Resultado do teste (distribuidora) — relevante quando a bateria volta (Em loja) */}
          <Card title="Resultado do teste (distribuidora)">
            <p className="mb-3 text-xs text-slate-400">
              Preencha quando a bateria voltar da distribuidora (fase <strong>Em loja</strong>).
            </p>
            <div className="mb-2 flex items-center gap-1.5">
              <Battery size={14} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-600">A bateria que voltou</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {RESULTADO_OPTIONS.map((opt) => {
                const on = resultado === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setResultado(on ? "" : opt.value)}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                      on
                        ? "bg-amber-400 text-slate-900 shadow-sm"
                        : "border border-amber-300 text-amber-600 hover:bg-amber-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
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
            {emprestimoTravado ? (
              /* Empréstimo já ativo salvo: só-leitura + devolução manual. */
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                    <Battery size={18} />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800">
                      {nomeProdutoEmprestimo || `Produto #${emprestimoSalvo.produtoId}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      Emprestado · Qtd: {emprestimoSalvo.quantidade}
                    </p>
                  </div>
                </div>
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  A devolução ao estoque acontece ao <strong>Finalizar</strong> a garantia, ou
                  manualmente pelo botão abaixo.
                </p>
                <button
                  type="button"
                  onClick={devolverEmprestimo}
                  disabled={devolvendo}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400 bg-white px-4 py-2.5 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-60"
                >
                  {devolvendo
                    ? <><Loader2 size={15} className="animate-spin" /> Devolvendo...</>
                    : <><Battery size={15} strokeWidth={2.2} /> Devolver empréstimo ao estoque</>}
                </button>
              </div>
            ) : emprestimoSalvo?.devolvido ? (
              /* Empréstimo já devolvido: histórico, sem ação. */
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                  <CheckCircle size={18} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-600">
                    {nomeProdutoEmprestimo || `Produto #${emprestimoSalvo.produtoId}`}
                  </p>
                  <p className="text-xs text-slate-400">Empréstimo devolvido ao estoque</p>
                </div>
              </div>
            ) : (
              <>
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
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Bateria emprestada (do estoque) *
                  </label>
                  <div className="relative">
                    <Battery size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={emprestimoProdutoId}
                      onChange={(e) => setEmprestimoProdutoId(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Selecione a bateria do estoque…</option>
                      {estoqueBaterias.map((p) => {
                        const disp = emEstoqueDe(p);
                        return (
                          <option key={p.id} value={p.id} disabled={disp <= 0}>
                            {[p.produto, p.modelo].filter(Boolean).join(" — ")}
                            {p.marca?.nome ? ` (${p.marca.nome})` : ""} · {disp} em estoque
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <GField label="Quantidade" icon={Hash}
                  type="number" min={1}
                  value={emprestimoQtd}
                  onChange={(e) => setEmprestimoQtd(e.target.value)} />

                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Ao salvar, será registrada uma <strong>saída</strong> no estoque
                  {nomeProdutoEmprestimo ? <> de <strong>{nomeProdutoEmprestimo}</strong></> : null} com
                  motivo "Empréstimo Garantia".
                </p>
              </div>
            )}
              </>
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
                onClick={finalizarGarantia}
                disabled={statusSalvo !== "EM_LOJA" || finalizando || !garantiaId}
                title={
                  statusSalvo !== "EM_LOJA"
                    ? "Só é possível finalizar quando a bateria está em loja (salve o status \"Em loja\")."
                    : undefined
                }
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {finalizando
                  ? <><Loader2 size={16} className="animate-spin" /> Finalizando...</>
                  : <><CheckCircle size={16} strokeWidth={2.2} /> Finalizar garantia</>}
              </button>
              {statusSalvo === "FINALIZADA" && (
                <p className="text-center text-xs text-slate-400">Garantia finalizada.</p>
              )}
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
