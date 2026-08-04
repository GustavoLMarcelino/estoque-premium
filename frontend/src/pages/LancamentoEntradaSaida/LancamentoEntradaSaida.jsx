import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowLeftRight, ArrowUpDown, Package, Hash,
  DollarSign, CreditCard, SlidersHorizontal, SendHorizontal,
  Battery, Music, User, TrendingUp, Wrench, PackagePlus,
} from "lucide-react";
import { EstoqueAPI } from "../../services/estoque";
import { MovAPI } from "../../services/movimentacoes";
import { EstoqueSomAPI } from "../../services/estoqueSom";
import { ESTOQUE_TIPOS } from "../../services/estoqueTipos";
import { useToast } from "../../components/ui/Toast";
import PedidoSomForm from "../../components/PedidoSomForm";
import EntradaSomForm from "../../components/EntradaSomForm";
import ProdutoSearchSelect from "../../components/ProdutoSearchSelect/ProdutoSearchSelect";
import {
  usaPrecoParcelado, margemLiquidaPct, precosMinimos,
  validarMargemMinima, MARGEM_MINIMA_PCT,
} from "../../utils/precos";
import { temLinha } from "../../services/auth";

export default function LancamentoEntradaSaida() {
  const toast = useToast();
  // Escopo de linha: só mostra o toggle/fluxo das linhas que o usuário opera.
  const verBaterias = temLinha("baterias");
  const verSom = temLinha("som");
  const [produtos, setProdutos] = useState([]);
  const [tipoEstoque, setTipoEstoque] = useState(
    verBaterias ? ESTOQUE_TIPOS.BATERIAS : ESTOQUE_TIPOS.SOM,
  );
  const [reloadKey, setReloadKey] = useState(0);
  // Remonta o combobox de produto depois de lançar (limpa o texto digitado, que
  // é estado interno do componente).
  const [resetProdutoKey, setResetProdutoKey] = useState(0);
  // Aba do ramo Som: "pedido" (venda, default) | "entrada" (reposição de estoque).
  // NÃO é o antigo modoSom (removido em d695bdc) — é uma aba dedicada de entrada.
  const [abaSom, setAbaSom] = useState("pedido");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Som só tem Pedido de Instalação; Baterias só tem Venda Simples.
  const modoPedido = tipoEstoque === ESTOQUE_TIPOS.SOM;

  const [lancamento, setLancamento] = useState({
    formaPagamento: "",
    parcelas: 1,
    tipo: "",
    produtoId: "",
    quantidade: "",
    vendedor: "",
  });

  // Vendedor só se aplica às saídas de baterias.
  const exibeVendedor = lancamento.tipo === "saida" && tipoEstoque === ESTOQUE_TIPOS.BATERIAS;

  const [valorOriginal, setValorOriginal] = useState(0); // valor de venda atual (unitario)
  const [ajusteValor, setAjusteValor] = useState("");
  const [tipoAjuste, setTipoAjuste] = useState("acrescimo");
  const [novoCusto, setNovoCusto] = useState("");
  // Preços de venda corrigidos na própria entrada ("" = manter o atual). Só
  // aparecem quando o custo novo derruba a margem abaixo do mínimo.
  const [novoVista, setNovoVista] = useState("");
  const [novoParcelado, setNovoParcelado] = useState("");

  const toMoney = (n) => {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(2) : "0.00";
  };
  const toInt = (n, def = 0) => {
    const v = parseInt(n, 10);
    return Number.isFinite(v) && v >= 0 ? v : def;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const service = tipoEstoque === ESTOQUE_TIPOS.SOM ? EstoqueSomAPI : EstoqueAPI;
        const data = await service.listar({ q: "" });
        if (!alive) return;
        setProdutos(data || []);
      } catch (e) {
        if (!alive) return;
        console.error("Carregar produtos erro:", e);
        setErr(e?.response?.data?.message || e?.message || "Falha ao carregar produtos");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tipoEstoque, reloadKey]);

  // Crédito → usa valor_parcelado; demais formas → valor_vista (regra única).
  const isParcelado = usaPrecoParcelado(lancamento.formaPagamento);

  useEffect(() => {
    if (!lancamento.produtoId) {
      setValorOriginal(0);
      return;
    }
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    const vista = p?.valor_vista != null ? Number(p.valor_vista) : Number(p?.valor_venda ?? 0);
    const parcelado = p?.valor_parcelado != null ? Number(p.valor_parcelado) : vista;
    const preco = isParcelado ? parcelado : vista;
    setValorOriginal(Number.isFinite(preco) ? preco : 0);
  }, [lancamento.produtoId, produtos, isParcelado]);

  const custoAtual = useMemo(() => {
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    const c = Number(p?.custo ?? 0);
    return Number.isFinite(c) ? c : null;
  }, [lancamento.produtoId, produtos]);

  const estoqueAtual = useMemo(() => {
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    if (!p) return 0;
    const em = Number(
      p?.em_estoque ??
      (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0))
    );
    return Number.isFinite(em) ? em : 0;
  }, [lancamento.produtoId, produtos]);

  // Trocar de produto/tipo zera os preços digitados — senão o valor pensado
  // para um produto seguiria aplicado no próximo.
  useEffect(() => {
    setNovoVista("");
    setNovoParcelado("");
  }, [lancamento.produtoId, lancamento.tipo]);

  // ---- Margem ao vivo da ENTRADA -------------------------------------------
  // Preços de venda ATUAIS do produto (independentes da forma de pagamento —
  // aqui os dois interessam, cada um contra a taxa dele).
  const precosAtuais = useMemo(() => {
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    if (!p) return null;
    const vista = p?.valor_vista != null ? Number(p.valor_vista) : Number(p?.valor_venda ?? 0);
    const parcelado = p?.valor_parcelado != null ? Number(p.valor_parcelado) : vista;
    return { vista, parcelado };
  }, [lancamento.produtoId, produtos]);

  // Estado final que a entrada vai gravar: custo novo (ou o atual) + preços
  // novos (ou os atuais). É exatamente o que o backend vai validar.
  const entradaFinal = useMemo(() => {
    if (lancamento.tipo !== "entrada" || novoCusto === "" || !precosAtuais) return null;
    const custo = Number(novoCusto);
    if (!Number.isFinite(custo) || custo <= 0) return null;
    const vista = novoVista === "" ? precosAtuais.vista : Number(novoVista);
    const parcelado = novoParcelado === "" ? precosAtuais.parcelado : Number(novoParcelado);
    return {
      custo,
      vista,
      parcelado,
      margens: margemLiquidaPct({ custo, valorVista: vista, valorParcelado: parcelado }),
      minimos: precosMinimos(custo),
      validacao: validarMargemMinima({ custo, valorVista: vista, valorParcelado: parcelado }),
    };
  }, [lancamento.tipo, novoCusto, novoVista, novoParcelado, precosAtuais]);

  // Enquanto algum preço estiver abaixo do mínimo, a entrada não conclui.
  const bloqueadoPorMargem = entradaFinal != null && !entradaFinal.validacao.ok;

  // Quantidade já digitada, para o total de conferência da saída.
  const qtdLancada = toInt(lancamento.quantidade, 0);

  const getValorFinalUnit = () => {
    const base = Number(valorOriginal) || 0;
    const v = Number(ajusteValor);
    if (!Number.isFinite(v)) return base;
    return tipoAjuste === "acrescimo" ? base + v : base - v;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLancamento((prev) => ({ ...prev, [name]: value }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const { tipo, produtoId, quantidade } = lancamento;

    if (!tipo || !produtoId || !quantidade) {
      toast.error("Preencha todos os campos.");
      return;
    }

    const q = toInt(quantidade, 0);
    if (q <= 0) {
      toast.error("Quantidade invalida.");
      return;
    }

    if (tipo === "saida" && q > estoqueAtual) {
      toast.error(`Nao ha estoque suficiente! Estoque atual: ${estoqueAtual} unidades.`);
      return;
    }

    if (exibeVendedor && !lancamento.vendedor) {
      toast.error("Selecione o vendedor.");
      return;
    }

    try {
      // Custo é opcional no lançamento de entrada (obrigatório só no Cadastro de
      // Produto). Só valida quando informado; vazio mantém o custo atual.
      if (tipo === "entrada" && novoCusto !== "" && Number(novoCusto) < 0) {
        toast.error("Valor de custo inválido.");
        return;
      }

      // Trava anti-prejuízo: com o custo novo, nenhum dos dois preços pode
      // ficar abaixo do mínimo. O backend rejeita igual; aqui é só evitar a
      // ida à API. Não há como forçar — o usuário ajusta o preço e reenvia.
      if (bloqueadoPorMargem) {
        toast.error(entradaFinal.validacao.message);
        return;
      }

      // Venda Simples é exclusiva de Baterias (Som usa o Pedido de Instalação).
      const movService = MovAPI;

      const payloadMov = {
        produto_id: Number(produtoId),
        tipo,
        quantidade: q,
      };
      // Custo e preços corrigidos vão NO MESMO request da movimentação: o
      // backend grava tudo numa transação, então nunca sobra entrada gravada
      // com custo desatualizado (era o risco do PUT separado que existia aqui).
      if (tipo === "entrada" && novoCusto !== "") {
        payloadMov.custo = toMoney(novoCusto);
        if (novoVista !== "") payloadMov.valor_vista = toMoney(novoVista);
        if (novoParcelado !== "") payloadMov.valor_parcelado = toMoney(novoParcelado);
      }
      if (tipo === "saida") {
        const unit = getValorFinalUnit();
        payloadMov.valor_final = toMoney(unit);
        if (exibeVendedor) payloadMov.vendedor = lancamento.vendedor;
        // Forma de pagamento e parcelas agora vão para o banco (antes viviam no
        // localStorage do navegador — invisível para o dashboard de outro user).
        // parcelas só faz sentido no crédito; o backend ignora nos demais.
        if (lancamento.formaPagamento) {
          payloadMov.forma_pagamento = lancamento.formaPagamento;
          if (lancamento.formaPagamento === "credito") {
            payloadMov.parcelas = Number(lancamento.parcelas || 1);
          }
        }
      }
      await movService.criar(payloadMov);

      toast.success("Lancamento registrado com sucesso!");

      // Fica NA TELA para o próximo lançamento (antes ia para /estoque, e
      // lançar em série obrigava a voltar e reconfigurar tudo). Zera o que muda
      // de uma venda para a outra e PRESERVA o que costuma se repetir: o
      // estoque (Baterias/Som, estado próprio) e o Tipo.
      setLancamento((prev) => ({
        formaPagamento: "",
        parcelas: 1,
        tipo: prev.tipo,
        produtoId: "",
        quantidade: "",
        vendedor: "",
      }));
      setAjusteValor("");
      setTipoAjuste("acrescimo");
      setNovoCusto("");
      setNovoVista("");
      setNovoParcelado("");
      // O combobox de produto é controlado por produtoId, então a seleção já cai
      // com o "" acima; o key remonta também o texto digitado, que é estado
      // interno dele. Garante campo limpo, sem resto do produto anterior.
      setResetProdutoKey((k) => k + 1);
      // Sem a navegação, a lista de produtos ficaria parada na versão de antes
      // da baixa — o "Estoque atual" do combobox e a validação de saída
      // mentiriam no próximo lançamento do mesmo produto.
      setReloadKey((k) => k + 1);
    } catch (e2) {
      console.error("Lancamento erro:", e2);
      toast.error(e2?.response?.data?.message || e2?.message || "Falha ao registrar lancamento");
    }
  }

  // accent do campo "Tipo": verde p/ entrada, vermelho p/ saída
  const tipoAccent =
    lancamento.tipo === "entrada"
      ? { ring: "border-emerald-300 focus:border-emerald-400 focus:ring-emerald-200", icon: "text-emerald-500" }
      : lancamento.tipo === "saida"
      ? { ring: "border-rose-300 focus:border-rose-400 focus:ring-rose-200", icon: "text-rose-500" }
      : { ring: "border-slate-300 focus:border-amber-400 focus:ring-amber-200", icon: "text-slate-400" };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
            <ArrowLeftRight size={24} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">
              Lançamento de Entrada/Saída ({tipoEstoque === ESTOQUE_TIPOS.SOM ? "Som" : "Baterias"})
            </h1>
            <p className="text-sm text-slate-500">Registre entradas e saídas do estoque</p>
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {err}
          </div>
        )}
        {loading && <div className="mt-4 text-sm text-slate-400">Carregando produtos...</div>}

        {/* Estoque — primeiro passo: define o fluxo (Baterias → Venda Simples;
            Som → Pedido de Instalação). Só as linhas do escopo do usuário; com
            uma linha só, o toggle some (não há o que escolher). */}
        {verBaterias && verSom && (
          <div className="mt-6">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">Estoque *</span>
            <div className="flex gap-2">
              <PillToggle active={tipoEstoque === ESTOQUE_TIPOS.BATERIAS} icon={Battery} label="Baterias"
                onClick={() => setTipoEstoque(ESTOQUE_TIPOS.BATERIAS)} />
              <PillToggle active={tipoEstoque === ESTOQUE_TIPOS.SOM} icon={Music} label="Som"
                onClick={() => setTipoEstoque(ESTOQUE_TIPOS.SOM)} />
            </div>
          </div>
        )}

        {modoPedido && (
          <div className="mt-6">
            {/* Aba do fluxo de Som: venda (Pedido de Instalação, default) ou
                entrada de estoque. Reexpõe a reposição de estoque de Som que a
                remoção do modo Venda Simples (d695bdc) tinha derrubado. */}
            <span className="mb-1.5 block text-sm font-medium text-slate-600">O que você quer fazer?</span>
            <div className="flex gap-2">
              <PillToggle active={abaSom === "pedido"} icon={Wrench} label="Pedido de Instalação"
                onClick={() => setAbaSom("pedido")} />
              <PillToggle active={abaSom === "entrada"} icon={PackagePlus} label="Entrada de estoque"
                onClick={() => setAbaSom("entrada")} />
            </div>

            {abaSom === "pedido" ? (
              <PedidoSomForm produtos={produtos} onCreated={() => setReloadKey((k) => k + 1)} />
            ) : (
              <EntradaSomForm produtos={produtos} onCreated={() => setReloadKey((k) => k + 1)} />
            )}
          </div>
        )}

        {!modoPedido && (
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {/* Tipo */}
          <FieldShell label="Tipo *" icon={ArrowUpDown} iconClass={tipoAccent.icon}>
            <select
              name="tipo" value={lancamento.tipo} onChange={handleChange} required
              className={`w-full appearance-none rounded-lg border bg-white py-2.5 pl-10 pr-3 text-slate-800 outline-none transition focus:ring-2 ${tipoAccent.ring}`}
            >
              <option value="">Selecione</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </FieldShell>

          {/* Produto */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Produto *</label>
            <ProdutoSearchSelect
              key={resetProdutoKey}
              produtos={produtos}
              value={lancamento.produtoId}
              onChange={(p) => setLancamento((prev) => ({ ...prev, produtoId: p ? String(p.id) : "" }))}
              placeholder="Selecione o produto"
              disabled={loading || produtos.length === 0}
              icon={Package}
              renderOption={(p) => {
                const estoque = Number(
                  p?.em_estoque ??
                  (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0))
                );
                return (
                  <>
                    <span className="text-slate-700">{p.produto || p.nome}</span>
                    <span className="text-xs text-slate-400">
                      Estoque atual: {Number.isFinite(estoque) ? estoque : 0}
                    </span>
                  </>
                );
              }}
            />
          </div>

          {/* Quantidade */}
          <FieldShell label="Quantidade *" icon={Hash}>
            <input
              type="number" name="quantidade" value={lancamento.quantidade} onChange={handleChange}
              placeholder="Digite a quantidade" min="1" required
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </FieldShell>

          {/* Valor de Custo (entrada) */}
          {lancamento.tipo === "entrada" && (
            <FieldShell label="Valor de Custo (opcional)" icon={DollarSign}>
              <input
                type="number"
                placeholder={custoAtual !== null ? `Custo atual: R$ ${Number(custoAtual).toFixed(2)} — deixe vazio para manter` : "Opcional — deixe vazio para manter o custo atual"}
                value={novoCusto} onChange={(e) => setNovoCusto(e.target.value)}
                min="0" step="0.01"
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
            </FieldShell>
          )}

          {/* Margem ao vivo — só aparece quando a entrada mexe no custo. */}
          {entradaFinal && <PainelMargem dados={entradaFinal} atuais={precosAtuais}
            novoVista={novoVista} setNovoVista={setNovoVista}
            novoParcelado={novoParcelado} setNovoParcelado={setNovoParcelado} />}

          {/* Valor de venda + ajuste (saída) */}
          {lancamento.tipo === "saida" && Number(valorOriginal) > 0 && (
            <>
              <FieldShell label={`Valor de Venda Atual (${isParcelado ? "parcelado" : "à vista"})`} icon={DollarSign}>
                <input
                  type="text" value={`R$ ${Number(valorOriginal).toFixed(2)}`} disabled
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-slate-500 outline-none"
                />
              </FieldShell>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-600">Ajuste no Valor de Venda</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <SlidersHorizontal size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={tipoAjuste} onChange={(e) => setTipoAjuste(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                    >
                      <option value="acrescimo">Acrescimo</option>
                      <option value="desconto">Desconto</option>
                    </select>
                  </div>
                  <input
                    type="number" placeholder="Valor" value={ajusteValor} onChange={(e) => setAjusteValor(e.target.value)}
                    className="flex-[2] rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                  />
                </div>
                <small className="mt-1 block text-slate-500">
                  Valor final unitario: R$ {getValorFinalUnit().toFixed(2)}
                </small>
                {/* O que vai ser gravado continua sendo o UNITÁRIO — o total é
                    só conferência antes de lançar. Sem ele, quem vendia 2
                    unidades via "R$ 350,00" na tela e não tinha onde confirmar
                    os R$ 700,00 da venda. Some com 1 unidade (seria repetir o
                    mesmo número duas vezes). */}
                {qtdLancada > 1 && (
                  <small className="mt-0.5 block font-semibold text-slate-700">
                    Total ({qtdLancada} un.): R$ {(getValorFinalUnit() * qtdLancada).toFixed(2)}
                  </small>
                )}
              </div>
            </>
          )}

          {/* Vendedor (saída de baterias) */}
          {exibeVendedor && (
            <FieldShell label="Vendedor *" icon={User}>
              <select
                value={lancamento.vendedor}
                onChange={(e) => setLancamento((prev) => ({ ...prev, vendedor: e.target.value }))}
                required
                className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              >
                <option value="">Selecione o vendedor</option>
                <option value="Ismael">Ismael</option>
                <option value="Gustavo">Gustavo</option>
              </select>
            </FieldShell>
          )}

          {/* Forma de pagamento (saída) */}
          {lancamento.tipo === "saida" && (
            <FieldShell label="Forma de pagamento" icon={CreditCard}>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={lancamento.formaPagamento}
                  onChange={(e) => setLancamento((prev) => ({ ...prev, formaPagamento: e.target.value }))}
                  className="flex-1 appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                >
                  <option value="">Selecione...</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">Pix</option>
                  <option value="debito">Debito</option>
                  <option value="credito">Credito</option>
                </select>

                {lancamento.formaPagamento === "credito" && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-600">Parcelas</label>
                    <input
                      type="number" min="1" max="10" value={lancamento.parcelas}
                      onChange={(e) => setLancamento((prev) => ({ ...prev, parcelas: Math.min(10, Math.max(1, parseInt(e.target.value || "1", 10))) }))}
                      className="w-20 rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                    />
                  </div>
                )}
              </div>
            </FieldShell>
          )}

          <button
            type="submit"
            disabled={loading || produtos.length === 0 || bloqueadoPorMargem}
            title={bloqueadoPorMargem ? "Ajuste os preços de venda para concluir a entrada" : undefined}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-3 font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <SendHorizontal size={18} strokeWidth={2.2} />
            Lançar
          </button>
        </form>
        )}
      </div>
    </div>
  );
}

/* ---------- subcomponentes de UI ---------- */

const brl = (n) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`;

/** Margem líquida resultante do custo novo, um preço por linha, cada um já
 *  descontada a taxa dele. Quando algum cai abaixo do mínimo, abre o campo
 *  para o usuário digitar o preço que ele quiser (o sistema só informa o piso).
 *  Aparece só na entrada com custo preenchido — fora disso a tela é a de antes. */
function PainelMargem({ dados, atuais, novoVista, setNovoVista, novoParcelado, setNovoParcelado }) {
  const { margens, minimos, validacao } = dados;
  const abaixo = (campo) => validacao.erros.some((e) => e.campo === campo);
  const ok = validacao.ok;

  return (
    <div className={`rounded-xl border p-4 ${ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
      <div className="flex items-center gap-2">
        <TrendingUp size={16} className={ok ? "text-emerald-600" : "text-rose-600"} />
        <span className={`text-sm font-semibold ${ok ? "text-emerald-800" : "text-rose-800"}`}>
          Margem com o custo de {brl(dados.custo)}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <LinhaMargem
          label="À vista" precoAtual={atuais?.vista} preco={dados.vista}
          margem={margens.vista} minimo={minimos.valor_vista} abaixo={abaixo("valor_vista")}
          valor={novoVista} onChange={setNovoVista}
        />
        <LinhaMargem
          label="Parcelado (10x)" precoAtual={atuais?.parcelado} preco={dados.parcelado}
          margem={margens.parcelado} minimo={minimos.valor_parcelado} abaixo={abaixo("valor_parcelado")}
          valor={novoParcelado} onChange={setNovoParcelado}
        />
      </div>

      {!ok && (
        <p className="mt-3 text-xs font-medium text-rose-700">
          Ajuste o(s) preço(s) acima para concluir a entrada. Nada é gravado enquanto a margem
          estiver abaixo de {MARGEM_MINIMA_PCT}% — nem a movimentação, nem o custo.
        </p>
      )}
    </div>
  );
}

function LinhaMargem({ label, precoAtual, preco, margem, minimo, abaixo, valor, onChange }) {
  // Uma vez aberto, o campo NAO some quando o preco passa a ser valido — sumir
  // no meio da digitacao tiraria o campo debaixo do dedo do usuario.
  const editando = abaixo || valor !== "";
  const pct = margem == null ? "—" : `${margem.toFixed(1).replace(".", ",")}%`;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="font-medium text-slate-700">
          {label}: {brl(preco)}
        </span>
        <span className={`font-semibold ${abaixo ? "text-rose-700" : "text-emerald-700"}`}>
          margem {pct}
          {abaixo && ` — abaixo do mínimo de ${MARGEM_MINIMA_PCT}%`}
        </span>
      </div>

      {editando && (
        <div className="mt-1.5">
          <input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={valor} onChange={(e) => onChange(e.target.value)}
            placeholder={`Novo preço ${label.toLowerCase()} — mínimo ${brl(minimo)}`}
            className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
          />
          <small className="mt-1 block text-xs text-slate-500">
            Atual: {brl(precoAtual)}. Você escolhe o novo valor — o mínimo para {MARGEM_MINIMA_PCT}% é {brl(minimo)}.
          </small>
        </div>
      )}
    </div>
  );
}

function FieldShell({ label, icon: Icon, iconClass = "text-slate-400", children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-600">{label}</label>
      <div className="relative">
        <Icon size={18} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`} />
        {children}
      </div>
    </div>
  );
}

function PillToggle({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
        active
          ? "bg-amber-400 text-slate-900 shadow-sm"
          : "border border-amber-300 bg-white text-amber-600 hover:bg-amber-50"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
