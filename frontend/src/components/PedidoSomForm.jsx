// src/components/PedidoSomForm.jsx
// Formulário de Pedido de Instalação de Som (pedido composto: produtos + serviços).
// A mão de obra é itemizada por CLASSE (igual ao Orçamento): cada produto puxa a
// mão de obra automática da sua classe, e serviços avulsos escolhem uma classe
// (ou digitam um valor manual como fallback). O total de mão de obra é a soma de
// todos os itens — permite combos como "Alarme + 4 Travas" no mesmo atendimento.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Car, Plus, X, Package, Wrench, CreditCard, Send, Loader2,
} from "lucide-react";
import { PedidoSomAPI } from "../services/pedidoSom";
import { ClassesSomAPI } from "../services/classesSom";
import { maoObraDoItem } from "../utils/orcamento";
import { useToast } from "./ui/Toast";

const COMISSAO_JOEL = 0.3;
const MANUAL = "MANUAL"; // valor especial do select de classe: serviço sem classe
const fmt = (n) => `R$ ${(Number(n) || 0).toFixed(2)}`;

const emEstoqueDe = (p) =>
  Number(
    p?.em_estoque ??
      (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0)),
  ) || 0;

export default function PedidoSomForm({ produtos = [], onCreated }) {
  const toast = useToast();
  const seq = useRef(0);

  const [veiculo, setVeiculo] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [itens, setItens] = useState([]); // ver formatos em addProduto/addServico
  const [classes, setClasses] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ClassesSomAPI.listar()
      .then((data) => setClasses(data ?? []))
      .catch((e) => console.error("PedidoSom: falha ao carregar classes:", e));
  }, []);

  const produtoById = useMemo(
    () => new Map(produtos.map((p) => [String(p.id), p])),
    [produtos],
  );
  const classeById = useMemo(
    () => new Map(classes.map((c) => [String(c.id), c])),
    [classes],
  );

  /** Mão de obra UNITÁRIA do item (produto → classe do produto; serviço → classe
   *  escolhida ou valor manual). */
  function maoObraUnitDe(it) {
    if (it.tipo === "PRODUTO") {
      const p = produtoById.get(String(it.produto_id));
      return Number(p?.classe?.valor_mao_obra) || 0;
    }
    if (it.classe_id && it.classe_id !== MANUAL) {
      const c = classeById.get(String(it.classe_id));
      return Number(c?.valor_mao_obra) || 0;
    }
    return Number(it.valor_unit) || 0; // manual
  }

  const precoUnitProduto = (it) => (it.tipo === "PRODUTO" ? Number(it.valor_unit) || 0 : 0);

  const totais = useMemo(() => {
    let totalProdutos = 0;
    let maoObra = 0;
    for (const it of itens) {
      const qtd = Number(it.quantidade) || 0;
      totalProdutos += precoUnitProduto(it) * qtd;
      // reaproveita o cálculo por item do Orçamento (qtd × mão de obra unitária)
      maoObra += maoObraDoItem({ maoObraUnit: maoObraUnitDe(it), qtd });
    }
    const comissao = maoObra * COMISSAO_JOEL;
    return { totalProdutos, maoObra, comissao, total: totalProdutos + maoObra };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, produtoById, classeById]);

  function addProduto() {
    setItens((prev) => [
      ...prev,
      { key: ++seq.current, tipo: "PRODUTO", produto_id: "", descricao: "", quantidade: 1, valor_unit: "" },
    ]);
  }

  function addServico() {
    setItens((prev) => [
      ...prev,
      { key: ++seq.current, tipo: "MAO_OBRA", classe_id: "", descricao: "", quantidade: 1, valor_unit: "" },
    ]);
  }

  function updateItem(key, patch) {
    setItens((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function removeItem(key) {
    setItens((prev) => prev.filter((i) => i.key !== key));
  }

  function onSelectProduto(key, produtoId) {
    const p = produtoById.get(String(produtoId));
    const patch = { produto_id: produtoId };
    const atual = itens.find((i) => i.key === key);
    if (p && (!atual?.valor_unit || Number(atual.valor_unit) === 0)) {
      patch.valor_unit = Number(p?.valor_venda ?? 0) || "";
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
        // serviço: por classe ou manual
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
      forma_pagamento: formaPagamento || undefined,
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
          };
        }
        // serviço por classe
        if (it.classe_id !== MANUAL) {
          return {
            tipo: "MAO_OBRA",
            classe_id: Number(it.classe_id),
            quantidade: Number(it.quantidade) || 1,
            descricao: it.descricao.trim() || undefined,
          };
        }
        // serviço manual (fallback sem classe)
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
                maoObraUnit={maoObraUnitDe(it)}
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

      {/* Forma de pagamento */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-600">Forma de pagamento</label>
        <div className="relative">
          <CreditCard size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value)}
            className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          >
            <option value="">Selecione...</option>
            <option value="Dinheiro">Dinheiro</option>
            <option value="Débito">Débito</option>
            <option value="Crédito">Crédito</option>
            <option value="PIX">PIX</option>
          </select>
        </div>
      </div>

      {/* Resumo */}
      <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <div className="flex items-center justify-between py-1 text-sm text-slate-600">
          <span>Total dos produtos</span>
          <span className="font-semibold text-slate-800">{fmt(totais.totalProdutos)}</span>
        </div>
        {totais.maoObra > 0 && (
          <>
            <div className="flex items-center justify-between py-1 text-sm text-slate-600">
              <span>Mão de obra (soma dos itens)</span>
              <span className="font-semibold text-slate-800">{fmt(totais.maoObra)}</span>
            </div>
            <div className="flex items-center justify-between py-1 text-sm">
              <span className="font-medium text-amber-600">Comissão Joel (30%)</span>
              <span className="font-bold text-amber-600">{fmt(totais.comissao)}</span>
            </div>
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

/* ---------- subcomponentes de item ---------- */

function ProdutoItem({ it, produtos, maoObraUnit, onSelectProduto, onUpdate, onRemove }) {
  const qtd = Number(it.quantidade) || 0;
  const subtotal = (Number(it.valor_unit) || 0) * qtd;
  const maoObra = maoObraUnit * qtd;
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
        <select
          value={it.produto_id}
          onChange={(e) => onSelectProduto(it.key, e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 sm:col-span-6"
        >
          <option value="">Selecione o produto</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {(p.produto || p.nome)} (Estoque: {emEstoqueDe(p)})
            </option>
          ))}
        </select>
        <input
          type="number" min="1" value={it.quantidade}
          onChange={(e) => onUpdate(it.key, { quantidade: e.target.value })}
          placeholder="Qtd"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 sm:col-span-2"
        />
        <input
          type="number" min="0" step="0.01" value={it.valor_unit}
          onChange={(e) => onUpdate(it.key, { valor_unit: e.target.value })}
          placeholder="Valor unit."
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 sm:col-span-2"
        />
        <div className="flex items-center justify-end rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 sm:col-span-2">
          {fmt(subtotal)}
        </div>
      </div>
      {maoObraUnit > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          + mão de obra da classe: {fmt(maoObra)}
          <span className="text-slate-400"> · {fmt(maoObraUnit)}/un</span>
        </p>
      )}
    </div>
  );
}

function ServicoItem({ it, classes, maoObraUnit, onUpdate, onRemove }) {
  const isManual = it.classe_id === MANUAL;
  const qtd = Number(it.quantidade) || 0;
  const maoObra = maoObraUnit * qtd;
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
          <option value="">Selecione a classe</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} ({fmt(c.valor_mao_obra)})
            </option>
          ))}
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
            {fmt(maoObra)}
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
      <p className="mt-2 text-xs font-semibold text-amber-700">
        Joel — 30%: {fmt(maoObra * COMISSAO_JOEL)}
      </p>
    </div>
  );
}
