// src/components/PedidoSomForm.jsx
// Formulário de Pedido de Instalação de Som (pedido composto: produtos + serviços).
// A mão de obra é itemizada por CLASSE (igual ao Orçamento): cada produto puxa a
// mão de obra automática da sua classe, e serviços avulsos escolhem uma classe
// (ou digitam um valor manual como fallback). O total de mão de obra é a soma de
// todos os itens — permite combos como "Alarme + 4 Travas" no mesmo atendimento.
//
// Preço dos produtos: toggle Parcelado/À Vista (base de preço, igual ao
// Orçamento) — separado da "Forma de pagamento" (método salvo no registro).
// Mão de obra: valor automático da classe, com override editável por item.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Car, Plus, X, Package, Wrench, CreditCard, Send, Loader2, CircleDollarSign,
} from "lucide-react";
import { PedidoSomAPI } from "../services/pedidoSom";
import ProdutoSearchSelect from "./ProdutoSearchSelect/ProdutoSearchSelect";
import { ClassesSomAPI } from "../services/classesSom";
import { ComissaoAPI } from "../services/comissao";
import { maoObraDoItem } from "../utils/orcamento";
import { usaPrecoParcelado } from "../utils/precos";
import { getRole } from "../services/auth";
import { useToast } from "./ui/Toast";

const MANUAL = "MANUAL"; // valor especial do select de classe: serviço sem classe
const fmt = (n) => `R$ ${(Number(n) || 0).toFixed(2)}`;
const temOverride = (v) => v !== "" && v != null && Number(v) >= 0;

const emEstoqueDe = (p) =>
  Number(
    p?.em_estoque ??
      (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0)),
  ) || 0;

// Base de preço do produto conforme o modo (mesma fonte do Orçamento/Tabela).
const precoParcelado = (p) => Number(p?.valor_parcelado ?? p?.valor_venda ?? 0) || 0;
const precoVista = (p) => Number(p?.valor_vista ?? p?.valor_venda ?? 0) || 0;
const precoBase = (p, modo) => (modo === "vista" ? precoVista(p) : precoParcelado(p));

// Base de preço derivada da forma de pagamento — REGRA ÚNICA (igual à Venda
// Simples de Baterias): Crédito usa o preço parcelado em QUALQUER nº de
// parcelas (o sub-caso parcelado/à vista fica só no registro do pedido);
// dinheiro/pix/débito usam o preço à vista. Antes de escolher, à vista.
const modoDePagamento = (forma) => (usaPrecoParcelado(forma) ? "parcelado" : "vista");

export default function PedidoSomForm({ produtos = [], onCreated }) {
  const toast = useToast();
  const seq = useRef(0);
  // Comissão é dado exclusivo de admin. Só o admin busca a config e vê a linha
  // de comissão — o /api/comissao é requireAdmin, então para não-admin nem
  // adianta buscar (403). O total do pedido NÃO depende disso (o backend
  // recalcula a comissão server-side na criação).
  const isAdmin = getRole() === "admin";

  const [veiculo, setVeiculo] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [creditoParcelado, setCreditoParcelado] = useState(true); // sub-caso do Crédito
  const [itens, setItens] = useState([]); // ver formatos em addProduto/addServico
  const [classes, setClasses] = useState([]);
  const [pctSom, setPctSom] = useState(30); // % comissão Som (da config) — só admin
  const [pctInsulf, setPctInsulf] = useState(25); // % comissão Insulfilme — só admin
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ClassesSomAPI.listar()
      .then((data) => setClasses(data ?? []))
      .catch((e) => console.error("PedidoSom: falha ao carregar classes:", e));
    if (!isAdmin) return; // não-admin não lê comissão
    ComissaoAPI.getConfig()
      .then((cfg) => {
        setPctSom(Number(cfg?.percentual_mao_obra) || 30);
        setPctInsulf(Number(cfg?.percentual_insulfilme) || 25);
      })
      .catch(() => {});
  }, [isAdmin]);

  const produtoById = useMemo(
    () => new Map(produtos.map((p) => [String(p.id), p])),
    [produtos],
  );
  const classeById = useMemo(
    () => new Map(classes.map((c) => [String(c.id), c])),
    [classes],
  );

  // base de preço vigente (derivada da forma de pagamento)
  const modo = modoDePagamento(formaPagamento);

  /** Mão de obra AUTOMÁTICA do item (da classe do produto ou da classe escolhida),
   *  ignorando override — usada como placeholder/base. */
  function maoObraAutoDe(it) {
    if (it.tipo === "PRODUTO") {
      const p = produtoById.get(String(it.produto_id));
      return Number(p?.classe?.valor_mao_obra) || 0;
    }
    if (it.classe_id && it.classe_id !== MANUAL) {
      const c = classeById.get(String(it.classe_id));
      return Number(c?.valor_mao_obra) || 0;
    }
    return 0;
  }

  /** Mão de obra UNITÁRIA efetiva: override do item quando preenchido; senão o
   *  automático da classe; serviço manual usa o próprio valor. */
  function maoObraUnitDe(it) {
    if (temOverride(it.mao_obra_unit)) return Number(it.mao_obra_unit);
    if (it.tipo === "PRODUTO" || (it.classe_id && it.classe_id !== MANUAL)) return maoObraAutoDe(it);
    return Number(it.valor_unit) || 0; // manual
  }

  /** Categoria do item (SOM|INSULFILME) — define o % de comissão do Joel. */
  function categoriaDe(it) {
    if (it.tipo === "PRODUTO") {
      const p = produtoById.get(String(it.produto_id));
      return p?.classe?.categoria === "INSULFILME" ? "INSULFILME" : "SOM";
    }
    if (it.classe_id && it.classe_id !== MANUAL) {
      const c = classeById.get(String(it.classe_id));
      return c?.categoria === "INSULFILME" ? "INSULFILME" : "SOM";
    }
    return "SOM"; // manual = Som
  }
  const pctDe = (it) => (categoriaDe(it) === "INSULFILME" ? pctInsulf : pctSom);

  const precoUnitProduto = (it) => (it.tipo === "PRODUTO" ? Number(it.valor_unit) || 0 : 0);

  const totais = useMemo(() => {
    let totalProdutos = 0;
    let maoObra = 0;
    let comissao = 0;
    for (const it of itens) {
      const qtd = Number(it.quantidade) || 0;
      totalProdutos += precoUnitProduto(it) * qtd;
      // reaproveita o cálculo por item do Orçamento (qtd × mão de obra unitária)
      const mo = maoObraDoItem({ maoObraUnit: maoObraUnitDe(it), qtd });
      maoObra += mo;
      comissao += (mo * pctDe(it)) / 100; // % por categoria (Som 30 / Insulfilme 25)
    }
    return { totalProdutos, maoObra, comissao, total: totalProdutos + maoObra };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, produtoById, classeById, pctSom, pctInsulf]);

  function addProduto() {
    setItens((prev) => [
      ...prev,
      { key: ++seq.current, tipo: "PRODUTO", produto_id: "", descricao: "", quantidade: 1, valor_unit: "", precoEditado: false, mao_obra_unit: "" },
    ]);
  }

  function addServico() {
    setItens((prev) => [
      ...prev,
      { key: ++seq.current, tipo: "MAO_OBRA", classe_id: "", descricao: "", quantidade: 1, valor_unit: "", mao_obra_unit: "" },
    ]);
  }

  function updateItem(key, patch) {
    setItens((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function removeItem(key) {
    setItens((prev) => prev.filter((i) => i.key !== key));
  }

  // Re-aplica o preço-base aos produtos NÃO editados manualmente.
  function reaplicarPreco(novoModo) {
    setItens((prev) =>
      prev.map((it) => {
        if (it.tipo === "PRODUTO" && it.produto_id && !it.precoEditado) {
          const p = produtoById.get(String(it.produto_id));
          return { ...it, valor_unit: precoBase(p, novoModo) || "" };
        }
        return it;
      }),
    );
  }

  function onFormaChange(forma) {
    setFormaPagamento(forma);
    reaplicarPreco(modoDePagamento(forma));
  }

  // Sub-caso do Crédito: só muda o rótulo salvo no pedido — a base de preço é
  // sempre a parcelada quando a forma é Crédito (regra única com Baterias).
  function onCreditoParceladoChange(parcelado) {
    setCreditoParcelado(parcelado);
  }

  function onSelectProduto(key, produtoId) {
    const p = produtoById.get(String(produtoId));
    const patch = { produto_id: produtoId };
    const atual = itens.find((i) => i.key === key);
    // preenche o preço pela base atual, a menos que o usuário já tenha editado
    if (p && !atual?.precoEditado) {
      patch.valor_unit = precoBase(p, modo) || "";
    }
    updateItem(key, patch);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (itens.length === 0) {
      toast.error("Adicione ao menos um item ao pedido.");
      return;
    }
    for (const it of itens) {
      if (it.tipo === "PRODUTO") {
        if (!it.produto_id) { toast.error("Selecione o produto em todos os itens de produto."); return; }
        if (!(Number(it.valor_unit) > 0)) { toast.error("Informe um valor unitário válido nos produtos."); return; }
        if (!(Number(it.quantidade) > 0)) { toast.error("Informe uma quantidade válida nos produtos."); return; }
      } else {
        if (!it.classe_id) { toast.error("Escolha a classe do serviço (ou 'Outro' para valor manual)."); return; }
        if (it.classe_id === MANUAL) {
          if (!it.descricao.trim()) { toast.error("Descreva o serviço avulso manual."); return; }
          if (!(Number(it.valor_unit) > 0)) { toast.error("Informe o valor da mão de obra no serviço manual."); return; }
        }
        if (!(Number(it.quantidade) > 0)) { toast.error("Informe uma quantidade válida nos serviços."); return; }
      }
    }

    const payload = {
      veiculo: veiculo.trim() || undefined,
      // Crédito grava o sub-caso (parcelado/à vista) no histórico; demais formas
      // vão como estão. O preço escolhido já fica no valor_unit de cada item.
      forma_pagamento: formaPagamento
        ? (formaPagamento === "Crédito"
            ? `Crédito ${creditoParcelado ? "parcelado" : "à vista"}`
            : formaPagamento)
        : undefined,
      itens: itens.map((it) => {
        if (it.tipo === "PRODUTO") {
          const p = produtoById.get(String(it.produto_id));
          const nome = p ? [p.produto || p.nome, p.modelo].filter(Boolean).join(" - ") : "";
          return {
            tipo: "PRODUTO",
            produto_id: Number(it.produto_id),
            descricao: nome,
            quantidade: Number(it.quantidade) || 1,
            valor_unit: Number(it.valor_unit),
            ...(temOverride(it.mao_obra_unit) ? { mao_obra_unit: Number(it.mao_obra_unit) } : {}),
          };
        }
        if (it.classe_id !== MANUAL) {
          return {
            tipo: "MAO_OBRA",
            classe_id: Number(it.classe_id),
            quantidade: Number(it.quantidade) || 1,
            descricao: it.descricao.trim() || undefined,
            ...(temOverride(it.mao_obra_unit) ? { mao_obra_unit: Number(it.mao_obra_unit) } : {}),
          };
        }
        return {
          tipo: "MAO_OBRA",
          descricao: it.descricao.trim(),
          quantidade: Number(it.quantidade) || 1,
          valor_unit: Number(it.valor_unit),
        };
      }),
    };

    setSaving(true);
    try {
      await PedidoSomAPI.criar(payload);
      toast.success("Pedido lançado com sucesso!");
      setVeiculo("");
      setFormaPagamento("");
      setItens([]);
      onCreated?.();
    } catch (err) {
      console.error("POST /pedido-som erro:", err);
      toast.error(err?.response?.data?.message || err?.message || "Falha ao lançar pedido.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
      {/* Veículo */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-600">Veículo (opcional)</label>
        <div className="relative">
          <Car size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={veiculo}
            onChange={(e) => setVeiculo(e.target.value)}
            placeholder="Ex: Honda Civic 2019"
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </div>

      {/* Itens */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600">Itens do pedido</span>
        </div>

        <div className="space-y-3">
          {itens.map((it) =>
            it.tipo === "PRODUTO" ? (
              <ProdutoItem
                key={it.key}
                it={it}
                produtos={produtos}
                maoObraAuto={maoObraAutoDe(it)}
                maoObraUnit={maoObraUnitDe(it)}
                onSelectProduto={onSelectProduto}
                onUpdate={updateItem}
                onRemove={removeItem}
              />
            ) : (
              <ServicoItem
                key={it.key}
                it={it}
                classes={classes}
                maoObraAuto={maoObraAutoDe(it)}
                maoObraUnit={maoObraUnitDe(it)}
                pct={pctDe(it)}
                onUpdate={updateItem}
                onRemove={removeItem}
              />
            ),
          )}

          {itens.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400">
              Nenhum item adicionado ainda.
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addProduto}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-600 transition-colors hover:bg-amber-50"
          >
            <Plus size={16} /> Adicionar Produto
          </button>
          <button
            type="button"
            onClick={addServico}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-600 transition-colors hover:bg-amber-50"
          >
            <Plus size={16} /> Adicionar Serviço
          </button>
        </div>
      </div>

      {/* Forma de pagamento — define a base de preço (Crédito abre parcelado/à vista) */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-600">Forma de pagamento</label>
        <div className="relative">
          <CreditCard size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={formaPagamento}
            onChange={(e) => onFormaChange(e.target.value)}
            className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          >
            <option value="">Selecione...</option>
            <option value="Dinheiro">Dinheiro</option>
            <option value="Débito">Débito</option>
            <option value="Crédito">Crédito</option>
            <option value="PIX">PIX</option>
          </select>
        </div>

        {/* Crédito pergunta o sub-caso só para o registro do pedido —
            o preço é o parcelado nos dois (regra única com Baterias). */}
        {formaPagamento === "Crédito" ? (
          <>
            <div className="mt-2 flex gap-2">
              <ModoBtn active={creditoParcelado} icon={CreditCard} label="Parcelado" onClick={() => onCreditoParceladoChange(true)} />
              <ModoBtn active={!creditoParcelado} icon={CircleDollarSign} label="À Vista" onClick={() => onCreditoParceladoChange(false)} />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">Crédito usa o preço parcelado (1x a 10x).</p>
          </>
        ) : (
          <p className="mt-1.5 text-xs text-slate-400">
            {formaPagamento ? "Preço à vista." : "Preço à vista até você escolher a forma."}
          </p>
        )}
      </div>

      {/* Resumo */}
      <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <div className="flex items-center justify-between py-1 text-sm text-slate-600">
          <span>Total dos produtos ({modo === "vista" ? "à vista" : "parcelado"})</span>
          <span className="font-semibold text-slate-800">{fmt(totais.totalProdutos)}</span>
        </div>
        {totais.maoObra > 0 && (
          <>
            {/* Mão de obra é parte do total do pedido (o instalador precisa vê-la
                para fechar o valor). A COMISSÃO, não — só admin. */}
            <div className="flex items-center justify-between py-1 text-sm text-slate-600">
              <span>Mão de obra (soma dos itens)</span>
              <span className="font-semibold text-slate-800">{fmt(totais.maoObra)}</span>
            </div>
            {isAdmin && (
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="font-medium text-amber-600">Comissão Joel</span>
                <span className="font-bold text-amber-600">{fmt(totais.comissao)}</span>
              </div>
            )}
          </>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-base font-bold text-slate-800">Total do pedido</span>
          <span className="text-xl font-extrabold text-slate-900">{fmt(totais.total)}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving || itens.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-3 font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} strokeWidth={2.2} />}
        Lançar Pedido
      </button>
    </form>
  );
}

/* ---------- subcomponentes ---------- */

function ModoBtn({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
        active ? "bg-amber-400 text-slate-900 shadow-sm" : "border border-amber-300 bg-white text-amber-600 hover:bg-amber-50"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

// Campo de override da mão de obra: vazio usa o automático (placeholder mostra o
// valor da classe); ao digitar, sobrescreve; ao limpar, volta ao automático.
function MaoObraOverride({ it, maoObraAuto, maoObraUnit, onUpdate }) {
  const qtd = Number(it.quantidade) || 0;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Wrench size={14} className="text-amber-500" />
      <label className="text-xs font-medium text-slate-500">Mão de obra (un.)</label>
      <input
        type="number" min="0" step="0.01" value={it.mao_obra_unit}
        onChange={(e) => onUpdate(it.key, { mao_obra_unit: e.target.value })}
        placeholder={maoObraAuto > 0 ? `${maoObraAuto.toFixed(2)} (classe)` : "0,00"}
        className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
      />
      <span className="text-xs text-amber-600">= {fmt(maoObraUnit * qtd)}</span>
      {temOverride(it.mao_obra_unit) && (
        <button
          type="button"
          onClick={() => onUpdate(it.key, { mao_obra_unit: "" })}
          className="text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
        >
          usar o da classe
        </button>
      )}
    </div>
  );
}

function ProdutoItem({ it, produtos, maoObraAuto, maoObraUnit, onSelectProduto, onUpdate, onRemove }) {
  const qtd = Number(it.quantidade) || 0;
  const subtotal = (Number(it.valor_unit) || 0) * qtd;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Package size={14} className="text-amber-500" /> Produto
        <button type="button" onClick={() => onRemove(it.key)}
          className="ml-auto rounded p-1 text-red-500 transition-colors hover:bg-red-50" aria-label="Remover item">
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <ProdutoSearchSelect
          produtos={produtos}
          value={it.produto_id}
          onChange={(p) => onSelectProduto(it.key, p ? String(p.id) : "")}
          placeholder="Selecione o produto"
          className="sm:col-span-6"
          renderOption={(p) => (
            <>
              <span className="text-slate-700">{p.produto || p.nome}</span>
              <span className="text-xs text-slate-400">Estoque: {emEstoqueDe(p)}</span>
            </>
          )}
        />
        <input
          type="number" min="1" value={it.quantidade}
          onChange={(e) => onUpdate(it.key, { quantidade: e.target.value })}
          placeholder="Qtd"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 sm:col-span-2"
        />
        <input
          type="number" min="0" step="0.01" value={it.valor_unit}
          onChange={(e) => onUpdate(it.key, { valor_unit: e.target.value, precoEditado: e.target.value !== "" })}
          placeholder="Valor unit."
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 sm:col-span-2"
        />
        <div className="flex items-center justify-end rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 sm:col-span-2">
          {fmt(subtotal)}
        </div>
      </div>
      <MaoObraOverride it={it} maoObraAuto={maoObraAuto} maoObraUnit={maoObraUnit} onUpdate={onUpdate} />
    </div>
  );
}

function ServicoItem({ it, classes, maoObraAuto, maoObraUnit, pct, onUpdate, onRemove }) {
  const isManual = it.classe_id === MANUAL;
  const temClasse = it.classe_id && !isManual;
  const qtd = Number(it.quantidade) || 0;
  // Classe agora é só Insulfilme (comissão 25%). Mão de obra de Som entra por
  // "Outro (valor manual)" — cai na comissão padrão de 30%.
  const classesInsulfilme = classes.filter((c) => c.categoria === "INSULFILME");
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
        <Wrench size={14} /> Serviço / Mão de obra
        <button type="button" onClick={() => onRemove(it.key)}
          className="ml-auto rounded p-1 text-red-500 transition-colors hover:bg-red-50" aria-label="Remover item">
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <select
          value={it.classe_id}
          onChange={(e) => onUpdate(it.key, { classe_id: e.target.value })}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 sm:col-span-6"
        >
          <option value="">Selecione o serviço</option>
          {classesInsulfilme.length > 0 && (
            <optgroup label="Insulfilme">
              {classesInsulfilme.map((c) => (
                <option key={c.id} value={c.id}>{c.nome} ({fmt(c.valor_mao_obra)})</option>
              ))}
            </optgroup>
          )}
          <option value={MANUAL}>Outro (valor manual)</option>
        </select>
        <input
          type="number" min="1" value={it.quantidade}
          onChange={(e) => onUpdate(it.key, { quantidade: e.target.value })}
          placeholder="Qtd"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 sm:col-span-2"
        />
        {isManual ? (
          <input
            type="number" min="0" step="0.01" value={it.valor_unit}
            onChange={(e) => onUpdate(it.key, { valor_unit: e.target.value })}
            placeholder="Mão de obra"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 sm:col-span-4"
          />
        ) : (
          <div className="flex items-center justify-end rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 sm:col-span-4">
            {fmt(maoObraUnit * qtd)}
          </div>
        )}
      </div>

      {isManual && (
        <input
          value={it.descricao}
          onChange={(e) => onUpdate(it.key, { descricao: e.target.value })}
          placeholder="Descrição do serviço (ex: Instalação de alarme do cliente)"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
      )}

      {/* Override da mão de obra: só faz sentido no serviço por classe
          (o manual já é o próprio valor digitado acima). */}
      {temClasse && (
        <MaoObraOverride it={it} maoObraAuto={maoObraAuto} maoObraUnit={maoObraUnit} onUpdate={onUpdate} />
      )}

      <p className="mt-2 text-xs font-semibold text-amber-700">
        Joel — {pct}%: {fmt((maoObraUnit * qtd * pct) / 100)}
      </p>
    </div>
  );
}
