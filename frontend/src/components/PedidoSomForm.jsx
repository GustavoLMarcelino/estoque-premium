// src/components/PedidoSomForm.jsx
// Formulário de Pedido de Instalação de Som (pedido composto: produtos + mão de obra).
import React, { useMemo, useRef, useState } from "react";
import {
  Car, Plus, X, Package, Wrench, Hash, DollarSign, CreditCard, Send, Loader2,
} from "lucide-react";
import { PedidoSomAPI } from "../services/pedidoSom";
import { useToast } from "./ui/Toast";

const COMISSAO_JOEL = 0.3;
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
  const [itens, setItens] = useState([]); // { key, tipo, produto_id, descricao, quantidade, valor_unit }
  const [saving, setSaving] = useState(false);

  const hasMaoObra = useMemo(() => itens.some((i) => i.tipo === "MAO_OBRA"), [itens]);

  const valorItem = (it) => (Number(it.quantidade) || 0) * (Number(it.valor_unit) || 0);

  const totais = useMemo(() => {
    const totalProdutos = itens
      .filter((i) => i.tipo === "PRODUTO")
      .reduce((acc, i) => acc + valorItem(i), 0);
    const maoObra = itens
      .filter((i) => i.tipo === "MAO_OBRA")
      .reduce((acc, i) => acc + valorItem(i), 0);
    const comissao = maoObra * COMISSAO_JOEL;
    return { totalProdutos, maoObra, comissao, total: totalProdutos + maoObra };
  }, [itens]);

  function addProduto() {
    setItens((prev) => [
      ...prev,
      { key: ++seq.current, tipo: "PRODUTO", produto_id: "", descricao: "", quantidade: 1, valor_unit: "" },
    ]);
  }

  function addMaoObra() {
    if (hasMaoObra) {
      toast.error("Só é permitido um item de mão de obra por pedido.");
      return;
    }
    setItens((prev) => [
      ...prev,
      { key: ++seq.current, tipo: "MAO_OBRA", produto_id: null, descricao: "", quantidade: 1, valor_unit: "" },
    ]);
  }

  function updateItem(key, patch) {
    setItens((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function removeItem(key) {
    setItens((prev) => prev.filter((i) => i.key !== key));
  }

  function onSelectProduto(key, produtoId) {
    const p = produtos.find((x) => String(x.id) === String(produtoId));
    const patch = { produto_id: produtoId };
    // pré-preenche o valor unitário com o valor de venda do produto, se ainda vazio
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
      if (it.tipo === "PRODUTO" && !it.produto_id) {
        toast.error("Selecione o produto em todos os itens de produto.");
        return;
      }
      if (it.tipo === "MAO_OBRA" && !it.descricao.trim()) {
        toast.error("Descreva o serviço de mão de obra.");
        return;
      }
      if (!(Number(it.valor_unit) > 0)) {
        toast.error("Informe um valor unitário válido em todos os itens.");
        return;
      }
      if (it.tipo === "PRODUTO" && !(Number(it.quantidade) > 0)) {
        toast.error("Informe uma quantidade válida nos produtos.");
        return;
      }
    }

    const payload = {
      veiculo: veiculo.trim() || undefined,
      forma_pagamento: formaPagamento || undefined,
      itens: itens.map((it) => {
        if (it.tipo === "PRODUTO") {
          const p = produtos.find((x) => String(x.id) === String(it.produto_id));
          const nome = p ? [p.produto || p.nome, p.modelo].filter(Boolean).join(" - ") : "";
          return {
            tipo: "PRODUTO",
            produto_id: Number(it.produto_id),
            descricao: nome,
            quantidade: Number(it.quantidade) || 1,
            valor_unit: Number(it.valor_unit),
          };
        }
        return {
          tipo: "MAO_OBRA",
          descricao: it.descricao.trim(),
          quantidade: 1,
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
              <div key={it.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Package size={14} className="text-amber-500" /> Produto
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    className="ml-auto rounded p-1 text-red-500 transition-colors hover:bg-red-50"
                    aria-label="Remover item"
                  >
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
                    onChange={(e) => updateItem(it.key, { quantidade: e.target.value })}
                    placeholder="Qtd"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 sm:col-span-2"
                  />
                  <input
                    type="number" min="0" step="0.01" value={it.valor_unit}
                    onChange={(e) => updateItem(it.key, { valor_unit: e.target.value })}
                    placeholder="Valor unit."
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 sm:col-span-2"
                  />
                  <div className="flex items-center justify-end rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 sm:col-span-2">
                    {fmt(valorItem(it))}
                  </div>
                </div>
              </div>
            ) : (
              <div key={it.key} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                  <Wrench size={14} /> Mão de obra
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    className="ml-auto rounded p-1 text-red-500 transition-colors hover:bg-red-50"
                    aria-label="Remover item"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <input
                    value={it.descricao}
                    onChange={(e) => updateItem(it.key, { descricao: e.target.value })}
                    placeholder="Ex: Instalação de câmera de ré"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 sm:col-span-7"
                  />
                  <input
                    type="number" min="0" step="0.01" value={it.valor_unit}
                    onChange={(e) => updateItem(it.key, { valor_unit: e.target.value })}
                    placeholder="Valor"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 sm:col-span-3"
                  />
                  <div className="flex items-center justify-center rounded-lg bg-amber-100 px-2 py-2 text-xs font-semibold text-amber-700 sm:col-span-2">
                    Joel — 30%: {fmt(valorItem(it) * COMISSAO_JOEL)}
                  </div>
                </div>
              </div>
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
            onClick={addMaoObra}
            disabled={hasMaoObra}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-600 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} /> Adicionar Mão de Obra
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
        {hasMaoObra && (
          <>
            <div className="flex items-center justify-between py-1 text-sm text-slate-600">
              <span>Mão de obra</span>
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
