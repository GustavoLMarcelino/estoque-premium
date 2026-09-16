// src/components/PedidoSomForm.jsx
// Formulário de Pedido de Instalação de Som (pedido composto: produtos + serviços).
// Item de PRODUTO é só peça (produto, qtd, valor) — não tem mão de obra desde
// que a classe saiu dos produtos de Som. A mão de obra entra como item de
// SERVIÇO, 100% digitado: nome livre, valor e a % de comissão do Joel daquele
// item. O total de mão de obra é a soma dos itens de serviço — permite combos
// como "Insulfilme + instalação avulsa" no mesmo atendimento, cada um com a
// sua %.
//
// Preço dos produtos: derivado da "Forma de pagamento" (regra única com
// Baterias) — Crédito usa o preço parcelado, as demais formas o à vista. O nº
// de parcelas do Crédito é capturado (1–10) mas NÃO altera preço nem total:
// serve ao rótulo salvo e à apuração da taxa de maquininha.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Car, Plus, X, Package, Wrench, CreditCard, Send, Loader2,
} from "lucide-react";
import { PedidoSomAPI } from "../services/pedidoSom";
import ProdutoSearchSelect from "./ProdutoSearchSelect/ProdutoSearchSelect";
import { ComissaoAPI } from "../services/comissao";
import { maoObraDoItem } from "../utils/orcamento";
import { usaPrecoParcelado, rotuloFormaSom, clampParcelas } from "../utils/precos";
import { sugerirPercentual } from "../utils/comissaoItem";
import { getRole } from "../services/auth";
import { useToast } from "./ui/Toast";

const fmt = (n) => `R$ ${(Number(n) || 0).toFixed(2)}`;

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
  const [parcelas, setParcelas] = useState("1"); // texto livre; clampParcelas só no onBlur (1–10)
  const [itens, setItens] = useState([]); // ver formatos em addProduto/addServico
  const [pctSom, setPctSom] = useState(30); // % sugerida p/ serviço comum (config)
  const [pctInsulf, setPctInsulf] = useState(25); // % sugerida p/ Insulfilme (config)
  const [saving, setSaving] = useState(false);

  useEffect(() => {
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

  // base de preço vigente (derivada da forma de pagamento)
  const modo = modoDePagamento(formaPagamento);

  /** Mão de obra UNITÁRIA do item. Serviço usa o próprio valor digitado;
   *  produto é sempre 0 — não tem mão de obra própria nem campo para informá-la. */
  function maoObraUnitDe(it) {
    if (it.tipo === "PRODUTO") return 0;
    return Number(it.valor_unit) || 0;
  }

  /** % de comissão do item: o que estiver no campo. Vazio cai na sugestão pelo
   *  nome, que é o mesmo valor que o campo exibe. */
  const pctDe = (it) => (
    it.percentual_comissao !== "" && it.percentual_comissao != null
      ? Number(it.percentual_comissao) || 0
      : sugerirPercentual(it.descricao, { pctSom, pctInsulfilme: pctInsulf })
  );

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
      comissao += (mo * pctDe(it)) / 100; // % do PRÓPRIO item
    }
    return { totalProdutos, maoObra, comissao, total: totalProdutos + maoObra };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, produtoById, pctSom, pctInsulf]);

  function addProduto() {
    setItens((prev) => [
      ...prev,
      { key: ++seq.current, tipo: "PRODUTO", produto_id: "", descricao: "", quantidade: 1, valor_unit: "", precoEditado: false },
    ]);
  }

  function addServico() {
    setItens((prev) => [
      ...prev,
      // pctTocado: uma vez que o usuário edita a %, a sugestão pelo nome para de
      // sobrescrever — renomear o serviço não pode desfazer escolha deliberada.
      { key: ++seq.current, tipo: "MAO_OBRA", descricao: "", quantidade: 1, valor_unit: "", percentual_comissao: "", pctTocado: false },
    ]);
  }

  function updateItem(key, patch) {
    setItens((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  /** Nome do serviço mudou: re-sugere a % SÓ enquanto o usuário não a tocou. */
  function onDescricaoServico(key, descricao) {
    setItens((prev) => prev.map((i) => {
      if (i.key !== key) return i;
      if (i.pctTocado) return { ...i, descricao };
      return {
        ...i,
        descricao,
        percentual_comissao: String(sugerirPercentual(descricao, { pctSom, pctInsulfilme: pctInsulf })),
      };
    }));
  }

  function onPercentualServico(key, valor) {
    updateItem(key, { percentual_comissao: valor, pctTocado: true });
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

  // Nº de parcelas do Crédito. NÃO mexe no preço — a base é sempre a parcelada
  // quando a forma é Crédito (regra única com Baterias); o número serve ao
  // rótulo salvo e à apuração de taxa da maquininha. Clamp 1–10 igual ao
  // Lançamento de Baterias; 1x é o que o antigo botão "À Vista" significava.
  // O clamp só roda no blur (onParcelasBlur) — fazer isso a cada tecla no
  // onChange trava o campo (apagar o "1" pra digitar de novo volta sozinho).
  function onParcelasChange(valor) {
    setParcelas(valor);
  }
  function onParcelasBlur() {
    setParcelas(String(clampParcelas(parcelas)));
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
        if (!it.descricao.trim()) { toast.error("Descreva o serviço."); return; }
        if (!(Number(it.valor_unit) > 0)) { toast.error("Informe o valor da mão de obra no serviço."); return; }
        if (!(Number(it.quantidade) > 0)) { toast.error("Informe uma quantidade válida nos serviços."); return; }
        const pct = Number(it.percentual_comissao);
        if (!(pct >= 0 && pct <= 100)) { toast.error("A % de comissão do serviço deve ficar entre 0 e 100."); return; }
      }
    }

    // Rótulo salvo no pedido — regra única em utils/precos.js, compartilhada
    // com a tela de EDIÇÃO do pedido (Registro). Duplicá-la aqui deixaria as
    // duas telas gravando formatos diferentes no mesmo campo.
    const isCredito = formaPagamento === "Crédito";
    const parcelasClamped = clampParcelas(parcelas);
    const rotuloForma = rotuloFormaSom(formaPagamento, parcelasClamped);

    const payload = {
      veiculo: veiculo.trim() || undefined,
      forma_pagamento: formaPagamento ? rotuloForma : undefined,
      // parcelas só faz sentido no crédito; o backend ignora nas demais formas.
      ...(isCredito ? { parcelas: parcelasClamped } : {}),
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
            // Sem mao_obra_unit: produto de Som não tem mão de obra própria
            // desde a remoção da classe do produto. A mão de obra entra como
            // item de serviço à parte.
          };
        }
        return {
          tipo: "MAO_OBRA",
          descricao: it.descricao.trim(),
          quantidade: Number(it.quantidade) || 1,
          valor_unit: Number(it.valor_unit),
          percentual_comissao: Number(it.percentual_comissao),
        };
      }),
    };

    setSaving(true);
    try {
      await PedidoSomAPI.criar(payload);
      toast.success("Pedido lançado com sucesso!");
      setVeiculo("");
      setFormaPagamento("");
      setParcelas("1");
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
        <label className="mb-1.5 block text-sm font-medium text-[var(--cp-text-muted)]">Veículo (opcional)</label>
        <div className="relative">
          <Car size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cp-text-muted)]" />
          <input
            value={veiculo}
            onChange={(e) => setVeiculo(e.target.value)}
            placeholder="Ex: Honda Civic 2019"
            className="w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] py-2.5 pl-10 pr-3 text-[var(--cp-ink)] outline-none transition placeholder:text-[var(--cp-text-muted)] focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
          />
        </div>
      </div>

      {/* Itens */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--cp-text-muted)]">Itens do pedido</span>
        </div>

        <div className="space-y-3">
          {itens.map((it) =>
            it.tipo === "PRODUTO" ? (
              <ProdutoItem
                key={it.key}
                it={it}
                produtos={produtos}
                onSelectProduto={onSelectProduto}
                onUpdate={updateItem}
                onRemove={removeItem}
              />
            ) : (
              <ServicoItem
                key={it.key}
                it={it}
                maoObraUnit={maoObraUnitDe(it)}
                pct={pctDe(it)}
                onUpdate={updateItem}
                onDescricao={onDescricaoServico}
                onPercentual={onPercentualServico}
                onRemove={removeItem}
              />
            ),
          )}

          {itens.length === 0 && (
            <p className="rounded-[var(--cp-r-lg)] border border-dashed border-[var(--cp-line)] py-6 text-center text-sm text-[var(--cp-text-muted)]">
              Nenhum item adicionado ainda.
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addProduto}
            className="inline-flex items-center gap-1.5 rounded-[var(--cp-r-lg)] border-[length:var(--cp-bw-12)] border-[var(--cp-ink)] bg-[var(--cp-panel)] px-3 py-2 font-display text-sm font-bold text-[var(--cp-ink)] transition-colors hover:bg-[var(--cp-panel-alt)]"
          >
            <Plus size={16} /> Adicionar Produto
          </button>
          <button
            type="button"
            onClick={addServico}
            className="inline-flex items-center gap-1.5 rounded-[var(--cp-r-lg)] border-[length:var(--cp-bw-12)] border-[var(--cp-ink)] bg-[var(--cp-panel)] px-3 py-2 font-display text-sm font-bold text-[var(--cp-ink)] transition-colors hover:bg-[var(--cp-panel-alt)]"
          >
            <Plus size={16} /> Adicionar Serviço
          </button>
        </div>
      </div>

      {/* Forma de pagamento — define a base de preço (Crédito abre parcelado/à vista) */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--cp-text-muted)]">Forma de pagamento</label>
        <div className="relative">
          <CreditCard size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cp-text-muted)]" />
          <select
            value={formaPagamento}
            onChange={(e) => onFormaChange(e.target.value)}
            className="w-full appearance-none rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] py-2.5 pl-10 pr-3 text-[var(--cp-ink)] outline-none transition focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
          >
            <option value="">Selecione...</option>
            <option value="Dinheiro">Dinheiro</option>
            <option value="Débito">Débito</option>
            <option value="Crédito">Crédito</option>
            <option value="PIX">PIX</option>
          </select>
        </div>

        {/* Crédito pergunta o nº de parcelas (1–10, igual ao Lançamento de
            Baterias). O preço NÃO muda com o número: crédito usa sempre o preço
            parcelado (regra única). 1x = o antigo "À Vista". */}
        {formaPagamento === "Crédito" ? (
          <>
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="parcelas-som" className="text-sm text-[var(--cp-text-muted)]">Parcelas</label>
              <input
                id="parcelas-som"
                type="number" min="1" max="10" value={parcelas}
                onChange={(e) => onParcelasChange(e.target.value)}
                onBlur={onParcelasBlur}
                className="w-20 rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] px-3 py-2 font-data text-[var(--cp-ink)] outline-none transition focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
              />
              <span className="font-data text-sm font-medium text-[var(--cp-text-muted)]">
                {rotuloFormaSom("Crédito", clampParcelas(parcelas))}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-[var(--cp-text-muted)]">
              Crédito usa o preço parcelado (1x a 10x) — o nº de parcelas não altera o total.
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-xs text-[var(--cp-text-muted)]">
            {formaPagamento ? "Preço à vista." : "Preço à vista até você escolher a forma."}
          </p>
        )}
      </div>

      {/* Resumo */}
      <div className="rounded-[var(--cp-r-xl)] border-[length:var(--cp-bw-02)] border-[var(--cp-ink)] bg-[var(--cp-panel)] shadow-[var(--cp-shadow-ring-xl)] p-4">
        <div className="flex items-center justify-between py-1 text-sm text-[var(--cp-text-muted)]">
          <span>Total dos produtos ({modo === "vista" ? "à vista" : "parcelado"})</span>
          <span className="font-data font-semibold text-[var(--cp-ink)]">{fmt(totais.totalProdutos)}</span>
        </div>
        {totais.maoObra > 0 && (
          <>
            {/* Mão de obra é parte do total do pedido (o instalador precisa vê-la
                para fechar o valor). A COMISSÃO, não — só admin. */}
            <div className="flex items-center justify-between py-1 text-sm text-[var(--cp-text-muted)]">
              <span>Mão de obra (soma dos itens)</span>
              <span className="font-data font-semibold text-[var(--cp-ink)]">{fmt(totais.maoObra)}</span>
            </div>
            {isAdmin && (
              <div className="flex items-center justify-between py-1 text-sm">
                <span className="font-medium text-[var(--cp-volt-ink)]">Comissão Joel</span>
                <span className="font-data font-bold text-[var(--cp-volt-ink)]">{fmt(totais.comissao)}</span>
              </div>
            )}
          </>
        )}
        <div className="mt-2 flex items-center justify-between border-t-2 border-[var(--cp-ink)] pt-3">
          <span className="font-display text-base font-bold text-[var(--cp-ink)]">Total do pedido</span>
          <span className="font-data text-xl font-extrabold text-[var(--cp-ink)]">{fmt(totais.total)}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving || itens.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-[var(--cp-r-lg)] border-[length:var(--cp-bw-02)] border-[var(--cp-ink)] bg-[var(--cp-volt)] shadow-[var(--cp-shadow-pill-active)] px-5 py-3 font-display font-extrabold text-[var(--cp-volt-ink)] transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} strokeWidth={2.2} />}
        Lançar Pedido
      </button>
    </form>
  );
}

/* ---------- subcomponentes ---------- */

// Card de PRODUTO: só peça (produto, qtd, valor). Não tem "Mão de obra (un.)" —
// desde a remoção da classe dos produtos de Som o campo valia sempre 0. Mão de
// obra é item de SERVIÇO à parte, com valor e % digitados lá.
function ProdutoItem({ it, produtos, onSelectProduto, onUpdate, onRemove }) {
  const qtd = Number(it.quantidade) || 0;
  const subtotal = (Number(it.valor_unit) || 0) * qtd;
  return (
    <div className="rounded-[var(--cp-r-xl)] border border-[var(--cp-line)] bg-[var(--cp-panel)] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--cp-text-muted)]">
        <Package size={14} className="text-[var(--cp-volt-ink)]" /> Produto
        <button type="button" onClick={() => onRemove(it.key)}
          className="ml-auto rounded-[var(--cp-r-checkbox)] p-1 text-[var(--cp-signal-red)] transition-colors hover:bg-[var(--cp-signal-red-bg)]" aria-label="Remover item">
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
              <span className="text-[var(--cp-ink)]">{p.produto || p.nome}</span>
              <span className="font-data text-xs text-[var(--cp-text-muted)]">Estoque: {emEstoqueDe(p)}</span>
            </>
          )}
        />
        <input
          type="number" min="1" value={it.quantidade}
          onChange={(e) => onUpdate(it.key, { quantidade: e.target.value })}
          placeholder="Qtd"
          className="rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] px-3 py-2 font-data text-sm text-[var(--cp-ink)] outline-none placeholder:font-sans focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40 sm:col-span-2"
        />
        <input
          type="number" min="0" step="0.01" value={it.valor_unit}
          onChange={(e) => onUpdate(it.key, { valor_unit: e.target.value, precoEditado: e.target.value !== "" })}
          placeholder="Valor unit."
          className="rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] px-3 py-2 font-data text-sm text-[var(--cp-ink)] outline-none placeholder:font-sans focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40 sm:col-span-2"
        />
        <div className="flex items-center justify-end rounded-[var(--cp-r-lg)] bg-[var(--cp-panel-alt)] shadow-[var(--cp-shadow-ring-xl)] px-3 py-2 font-data text-sm font-semibold text-[var(--cp-ink)] sm:col-span-2">
          {fmt(subtotal)}
        </div>
      </div>
    </div>
  );
}

// Serviço é lançamento livre: nome, qtd, valor e a % de comissão do item.
// A % vem sugerida pelo nome (Insulfilme → 25) e para de ser sugerida assim que
// o usuário a edita — ver onDescricaoServico/pctTocado no componente pai.
function ServicoItem({ it, maoObraUnit, pct, onUpdate, onDescricao, onPercentual, onRemove }) {
  const qtd = Number(it.quantidade) || 0;
  return (
    <div className="rounded-[var(--cp-r-xl)] border-[length:var(--cp-bw-12)] border-[var(--cp-volt)] bg-[var(--cp-volt)]/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--cp-volt-ink)]">
        <Wrench size={14} /> Serviço / Mão de obra
        <button type="button" onClick={() => onRemove(it.key)}
          className="ml-auto rounded-[var(--cp-r-checkbox)] p-1 text-[var(--cp-signal-red)] transition-colors hover:bg-[var(--cp-signal-red-bg)]" aria-label="Remover item">
          <X size={16} />
        </button>
      </div>
      <input
        value={it.descricao}
        onChange={(e) => onDescricao(it.key, e.target.value)}
        placeholder="Nome do serviço (ex: Insulfilme + Parabrisa, Instalação de alarme)"
        className="mb-2 w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] px-3 py-2 text-sm text-[var(--cp-ink)] outline-none focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <input
          type="number" min="1" value={it.quantidade}
          onChange={(e) => onUpdate(it.key, { quantidade: e.target.value })}
          placeholder="Qtd"
          className="rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] px-3 py-2 font-data text-sm text-[var(--cp-ink)] outline-none placeholder:font-sans focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40 sm:col-span-2"
        />
        <input
          type="number" min="0" step="0.01" value={it.valor_unit}
          onChange={(e) => onUpdate(it.key, { valor_unit: e.target.value })}
          placeholder="Mão de obra (un.)"
          className="rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] px-3 py-2 font-data text-sm text-[var(--cp-ink)] outline-none placeholder:font-sans focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40 sm:col-span-4"
        />
        <div className="flex items-center gap-1.5 sm:col-span-3">
          <input
            type="number" min="0" max="100" step="0.01" value={it.percentual_comissao}
            onChange={(e) => onPercentual(it.key, e.target.value)}
            placeholder="% Joel"
            className="w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] px-3 py-2 font-data text-sm text-[var(--cp-ink)] outline-none placeholder:font-sans focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
          />
          <span className="text-sm font-medium text-[var(--cp-text-muted)]">%</span>
        </div>
        <div className="flex items-center justify-end rounded-[var(--cp-r-lg)] bg-[var(--cp-panel)] shadow-[var(--cp-shadow-ring-xl)] px-3 py-2 font-data text-sm font-semibold text-[var(--cp-ink)] sm:col-span-3">
          {fmt(maoObraUnit * qtd)}
        </div>
      </div>

      <p className="mt-2 text-xs font-semibold text-[var(--cp-volt-ink)]">
        Joel — {pct}%: {fmt((maoObraUnit * qtd * pct) / 100)}
      </p>
    </div>
  );
}
