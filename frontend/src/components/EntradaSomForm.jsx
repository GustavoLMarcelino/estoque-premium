// Entrada de estoque de Som (SÓ entrada — reposição auditável via movimentação).
// Reexpõe o caminho que a remoção do modo "Venda Simples" (commit d695bdc)
// derrubou: aumenta a quantidade de um produto de Som SEM ser venda, gravando
// uma movimentação de ENTRADA. Backend intacto: POST /api/movimentacoes-som.
// NÃO mexe no lock de qtd_inicial do cadastro — reposição é sempre movimentação.
import React, { useMemo, useState } from "react";
import { PackagePlus, Hash, DollarSign, SendHorizontal, Loader2 } from "lucide-react";
import ProdutoSearchSelect from "./ProdutoSearchSelect/ProdutoSearchSelect";
import { MovSomAPI } from "../services/movimentacoesSom";
import { precosMinimos, validarMargemMinima } from "../utils/precos";
import { getRole } from "../services/auth";
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
  // Reposição de custo/preços na própria entrada ("" = manter o atual), igual
  // ao Lançamento de Baterias. Só admin: o backend responde 403 para os demais.
  const [novoCusto, setNovoCusto] = useState("");
  const [novoVista, setNovoVista] = useState("");
  const [novoParcelado, setNovoParcelado] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = getRole() === "admin";
  const produtoSel = produtos.find((p) => String(p.id) === String(produtoId)) || null;

  const toMoney = (n) => {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(2) : "0.00";
  };

  // Estado FINAL que a entrada vai gravar (custo novo + preços novos ou os
  // atuais) — exatamente o que o backend vai validar. Só existe quando o custo
  // foi preenchido; sem custo, a entrada é a de antes.
  const entradaFinal = useMemo(() => {
    if (!produtoSel || novoCusto === "") return null;
    const custo = Number(novoCusto);
    if (!Number.isFinite(custo) || custo <= 0) return null;
    const vistaAtual = Number(produtoSel.valor_vista ?? produtoSel.valor_venda ?? 0);
    const parceladoAtual = Number(produtoSel.valor_parcelado ?? vistaAtual);
    const vista = novoVista === "" ? vistaAtual : Number(novoVista);
    const parcelado = novoParcelado === "" ? parceladoAtual : Number(novoParcelado);
    return {
      minimos: precosMinimos(custo),
      validacao: validarMargemMinima({ custo, valorVista: vista, valorParcelado: parcelado }),
    };
  }, [produtoSel, novoCusto, novoVista, novoParcelado]);

  // Enquanto algum preço estiver abaixo do mínimo, a entrada não conclui.
  const bloqueadoPorMargem = entradaFinal != null && !entradaFinal.validacao.ok;

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

    // Custo é opcional na entrada (obrigatório só no Cadastro de Produto).
    // Só valida quando informado; vazio mantém o custo atual.
    if (novoCusto !== "" && !(Number(novoCusto) > 0)) {
      toast.error("Valor de custo inválido.");
      return;
    }
    // Trava anti-prejuízo: com o custo novo, nenhum dos dois preços pode ficar
    // abaixo do mínimo. O backend rejeita igual; aqui é só evitar a ida à API.
    if (bloqueadoPorMargem) {
      toast.error(entradaFinal.validacao.message);
      return;
    }

    setSaving(true);
    try {
      await MovSomAPI.criar({
        produto_id: Number(produtoId),
        tipo: "entrada",
        quantidade: q,
        // Sem valor_final: numa entrada ele era gravado e nunca consumido por
        // cálculo nenhum (só decorava o Registro). O preço de compra que
        // importa é o custo abaixo, que persiste no produto. Ausente, o
        // backend grava o default "0.00" — igual às entradas de Baterias.
        // Custo e preços corrigidos vão NO MESMO request da movimentação: o
        // backend grava tudo numa transação, então nunca sobra entrada gravada
        // com custo desatualizado.
        ...(novoCusto !== "" ? { custo: toMoney(novoCusto) } : {}),
        ...(novoVista !== "" ? { valor_vista: toMoney(novoVista) } : {}),
        ...(novoParcelado !== "" ? { valor_parcelado: toMoney(novoParcelado) } : {}),
      });
      toast.success("Entrada registrada! O estoque foi atualizado.");
      setProdutoId("");
      setQuantidade("");
      setNovoCusto("");
      setNovoVista("");
      setNovoParcelado("");
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
        <label className="mb-1.5 block text-sm font-medium text-[var(--cp-text-muted)]">Produto *</label>
        <ProdutoSearchSelect
          produtos={produtos}
          value={produtoId}
          onChange={(p) => setProdutoId(p ? String(p.id) : "")}
          placeholder="Selecione o produto"
          disabled={produtos.length === 0}
          icon={PackagePlus}
          renderOption={(p) => (
            <>
              <span className="text-[var(--cp-ink)]">{p.produto || p.nome}</span>
              <span className="font-data text-xs text-[var(--cp-text-muted)]">Estoque atual: {emEstoqueDe(p)}</span>
            </>
          )}
        />
        {produtoSel && (
          <p className="mt-1 text-xs text-[var(--cp-text-muted)]">
            Estoque atual de <span className="font-medium text-[var(--cp-ink)]">{produtoSel.produto || produtoSel.nome}</span>: {emEstoqueDe(produtoSel)} un.
          </p>
        )}
      </div>

      {/* Quantidade */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--cp-text-muted)]">Quantidade *</label>
        <div className="relative">
          <Hash size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cp-text-muted)]" />
          <input
            type="number" min="1" value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="Quantas unidades entraram"
            className="w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] py-2.5 pl-10 pr-3 font-data text-[var(--cp-ink)] outline-none transition placeholder:font-sans placeholder:text-[var(--cp-text-muted)] focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
          />
        </div>
      </div>

      {/* Reposição de custo/preços — só admin (o backend responde 403 aos
          demais, igual ao PUT /api/estoque-som). Vazio = mantém o atual, então
          quem só quer repor quantidade segue com a tela de antes. */}
      {isAdmin && (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--cp-text-muted)]">Novo custo (opcional)</label>
            <div className="relative">
              <DollarSign size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cp-text-muted)]" />
              <input
                type="number" min="0" step="0.01" value={novoCusto}
                onChange={(e) => setNovoCusto(e.target.value)}
                placeholder={
                  produtoSel?.custo != null
                    ? `Custo atual: R$ ${Number(produtoSel.custo).toFixed(2)} — deixe vazio para manter`
                    : "Opcional — deixe vazio para manter o custo atual"
                }
                className="w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] py-2.5 pl-10 pr-3 font-data text-[var(--cp-ink)] outline-none transition placeholder:font-sans placeholder:text-[var(--cp-text-muted)] focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--cp-text-muted)]">Novo valor à vista (opcional)</label>
              <input
                type="number" min="0" step="0.01" value={novoVista}
                onChange={(e) => setNovoVista(e.target.value)}
                placeholder={
                  produtoSel?.valor_vista != null
                    ? `Atual: R$ ${Number(produtoSel.valor_vista).toFixed(2)}`
                    : "Deixe vazio para manter"
                }
                className="w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] px-3 py-2.5 font-data text-[var(--cp-ink)] outline-none transition placeholder:font-sans placeholder:text-[var(--cp-text-muted)] focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--cp-text-muted)]">Novo valor parcelado (opcional)</label>
              <input
                type="number" min="0" step="0.01" value={novoParcelado}
                onChange={(e) => setNovoParcelado(e.target.value)}
                placeholder={
                  produtoSel?.valor_parcelado != null
                    ? `Atual: R$ ${Number(produtoSel.valor_parcelado).toFixed(2)}`
                    : "Deixe vazio para manter"
                }
                className="w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] px-3 py-2.5 font-data text-[var(--cp-ink)] outline-none transition placeholder:font-sans placeholder:text-[var(--cp-text-muted)] focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
              />
            </div>
          </div>

          {/* Antecipa a trava do backend: com o custo novo, cada preço é
              conferido contra a taxa dele (débito no à vista, crédito 10x no
              parcelado). O backend rejeita igual — aqui é só o aviso. */}
          {bloqueadoPorMargem && (
            <div className="rounded-[var(--cp-r-xl)] border-[length:var(--cp-bw-12)] border-[var(--cp-signal-red)] bg-[var(--cp-signal-red-bg)] p-3 text-sm text-[var(--cp-signal-red)]">
              <p className="font-semibold">Margem mínima não atingida</p>
              <p className="mt-1">{entradaFinal.validacao.message}</p>
              <p className="mt-1 font-data text-xs">
                Mínimos para este custo — à vista R$ {entradaFinal.minimos.valor_vista.toFixed(2)} ·
                {" "}parcelado R$ {entradaFinal.minimos.valor_parcelado.toFixed(2)}.
              </p>
            </div>
          )}
        </>
      )}

      <button
        type="submit"
        disabled={saving || produtos.length === 0 || bloqueadoPorMargem}
        className="flex w-full items-center justify-center gap-2 rounded-[var(--cp-r-lg)] border-[length:var(--cp-bw-02)] border-[var(--cp-ink)] bg-[var(--cp-volt)] shadow-[var(--cp-shadow-pill-active)] px-5 py-3 font-display font-extrabold text-[var(--cp-volt-ink)] transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <SendHorizontal size={18} strokeWidth={2.2} />}
        Dar entrada
      </button>
    </form>
  );
}
