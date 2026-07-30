// Entrada de estoque de Som (SÓ entrada — reposição auditável via movimentação).
// Reexpõe o caminho que a remoção do modo "Venda Simples" (commit d695bdc)
// derrubou: aumenta a quantidade de um produto de Som SEM ser venda, gravando
// uma movimentação de ENTRADA. Backend intacto: POST /api/movimentacoes-som.
// NÃO mexe no lock de qtd_inicial do cadastro — reposição é sempre movimentação.
import React, { useState } from "react";
import { PackagePlus, Hash, DollarSign, SendHorizontal, Loader2 } from "lucide-react";
import ProdutoSearchSelect from "./ProdutoSearchSelect/ProdutoSearchSelect";
import { MovSomAPI } from "../services/movimentacoesSom";
import { useToast } from "./ui/Toast";

const emEstoqueDe = (p) =>
  Number(
    p?.em_estoque ??
      (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0)),
  ) || 0;

export default function EntradaSomForm({ produtos = [], onCreated }) {
  const toast = useToast();
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [valor, setValor] = useState(""); // opcional → valor_final
  const [saving, setSaving] = useState(false);

  const produtoSel = produtos.find((p) => String(p.id) === String(produtoId)) || null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!produtoId) {
      toast.error("Selecione o produto.");
      return;
    }
    const q = parseInt(quantidade, 10);
    if (!(q > 0)) {
      toast.error("Informe uma quantidade válida (maior que zero).");
      return;
    }

    setSaving(true);
    try {
      await MovSomAPI.criar({
        produto_id: Number(produtoId),
        tipo: "entrada",
        quantidade: q,
        // valor é opcional; o factory omite o campo quando vazio
        ...(valor !== "" ? { valor_final: valor } : {}),
      });
      toast.success("Entrada registrada! O estoque foi atualizado.");
      setProdutoId("");
      setQuantidade("");
      setValor("");
      // recarrega a lista no pai → o "Estoque atual: N" reflete o novo valor
      onCreated?.();
    } catch (err) {
      console.error("POST /movimentacoes-som (entrada) erro:", err);
      toast.error(err?.response?.data?.message || err?.message || "Falha ao registrar a entrada.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      {/* Produto */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-600">Produto *</label>
        <ProdutoSearchSelect
          produtos={produtos}
          value={produtoId}
          onChange={(p) => setProdutoId(p ? String(p.id) : "")}
          placeholder="Selecione o produto"
          disabled={produtos.length === 0}
          icon={PackagePlus}
          renderOption={(p) => (
            <>
              <span className="text-slate-700">{p.produto || p.nome}</span>
              <span className="text-xs text-slate-400">Estoque atual: {emEstoqueDe(p)}</span>
            </>
          )}
        />
        {produtoSel && (
          <p className="mt-1 text-xs text-slate-400">
            Estoque atual de <span className="font-medium text-slate-500">{produtoSel.produto || produtoSel.nome}</span>: {emEstoqueDe(produtoSel)} un.
          </p>
        )}
      </div>

      {/* Quantidade */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-600">Quantidade *</label>
        <div className="relative">
          <Hash size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="number" min="1" value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="Quantas unidades entraram"
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </div>

      {/* Valor (opcional) → valor_final */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-600">Valor da entrada (opcional)</label>
        <div className="relative">
          <DollarSign size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="number" min="0" step="0.01" value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00 — deixe vazio se não se aplica"
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving || produtos.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-3 font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <SendHorizontal size={18} strokeWidth={2.2} />}
        Dar entrada
      </button>
    </form>
  );
}
