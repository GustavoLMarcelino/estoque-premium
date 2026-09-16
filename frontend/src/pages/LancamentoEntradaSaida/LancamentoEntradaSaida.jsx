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
  validarMargemMinima, MARGEM_MINIMA_PCT, clampParcelas,
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
    // Cliente leva a bateria e paga depois. Não é forma de pagamento — é a
    // ausência dela por ora, e por isso desabilita o seletor em vez de virar
    // mais uma opção dentro dele.
    fiado: false,
    // Nome de quem levou. Texto livre: não há cadastro de cliente.
    clienteFiado: "",
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
  //
  // FIADO também usa o parcelado, e não o à vista: o preço à vista embute só a
  // taxa do débito, e quem leva sem pagar não está dando desconto de pagamento
  // imediato. Sem isto o fiado sairia mais barato que qualquer outra forma —
  // o incentivo invertido.
  const isParcelado = lancamento.fiado || usaPrecoParcelado(lancamento.formaPagamento);

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

    // Fiado sem dono é uma dívida que ninguém sabe cobrar. O backend também
    // barra (o schema recusa FIADO sem nome); aqui é só não gastar a ida à API.
    if (lancamento.fiado && !lancamento.clienteFiado.trim()) {
      toast.error("Informe o nome do cliente na venda fiado.");
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
        // Fiado exclui forma de pagamento: nada passou na máquina ainda. A forma
        // é informada na hora de quitar (Registro de Movimentação), que é quando
        // ela existe de fato e passa a valer para a taxa.
        if (lancamento.fiado) {
          payloadMov.status_pagamento = "FIADO";
          payloadMov.cliente_fiado = lancamento.clienteFiado.trim();
        } else if (lancamento.formaPagamento) {
          payloadMov.forma_pagamento = lancamento.formaPagamento;
          if (lancamento.formaPagamento === "credito") {
            payloadMov.parcelas = clampParcelas(lancamento.parcelas);
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
        // Não se repete: cada venda decide se é fiado. Deixar marcado faria a
        // próxima sair fiado por inércia.
        fiado: false,
        // Idem, e pior: o nome sobrando lançaria a próxima venda no nome do
        // cliente anterior — errado é bem pior que em branco.
        clienteFiado: "",
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
      ? { ring: "border-[var(--cp-signal-green)] focus:border-[var(--cp-signal-green)] focus:ring-[var(--cp-signal-green)]/30", icon: "text-[var(--cp-signal-green)]" }
      : lancamento.tipo === "saida"
      ? { ring: "border-[var(--cp-signal-red)] focus:border-[var(--cp-signal-red)] focus:ring-[var(--cp-signal-red)]/30", icon: "text-[var(--cp-signal-red)]" }
      : { ring: "border-[var(--cp-line)] focus:border-[var(--cp-ink)] focus:ring-[var(--cp-volt)]/40", icon: "text-[var(--cp-text-muted)]" };

  return (
    <div className="min-h-screen bg-[var(--cp-paper)] p-4 md:p-6">
      <div className="mx-auto max-w-xl rounded-[var(--cp-r-2xl)] border-[length:var(--cp-bw-02)] border-[var(--cp-ink)] bg-[var(--cp-panel)] shadow-[var(--cp-shadow-panel)] p-6 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-[var(--cp-r-icon)] border-[length:var(--cp-bw-02)] border-[var(--cp-ink)] bg-[var(--cp-icon-badge-bg)] text-[var(--cp-icon-badge-fg)]">
            <ArrowLeftRight size={24} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="font-display text-xl font-extrabold text-[var(--cp-ink)] md:text-2xl">
              Lançamento de Entrada/Saída ({tipoEstoque === ESTOQUE_TIPOS.SOM ? "Som" : "Baterias"})
            </h1>
            <p className="text-sm text-[var(--cp-text-muted)]">Registre entradas e saídas do estoque</p>
          </div>
        </div>

        {err && (
          <div className="mt-4 rounded-[var(--cp-r-lg)] border-[length:var(--cp-bw-12)] border-[var(--cp-signal-red)] bg-[var(--cp-signal-red-bg)] px-4 py-3 text-sm text-[var(--cp-signal-red)]">
            {err}
          </div>
        )}
        {loading && <div className="mt-4 text-sm text-[var(--cp-text-muted)]">Carregando produtos...</div>}

        {/* Estoque — primeiro passo: define o fluxo (Baterias → Venda Simples;
            Som → Pedido de Instalação). Só as linhas do escopo do usuário; com
            uma linha só, o toggle some (não há o que escolher). */}
        {verBaterias && verSom && (
          <div className="mt-6">
            <span className="mb-1.5 block text-sm font-medium text-[var(--cp-text-muted)]">Estoque *</span>
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
            <span className="mb-1.5 block text-sm font-medium text-[var(--cp-text-muted)]">O que você quer fazer?</span>
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
              className={`w-full appearance-none rounded-[var(--cp-r-lg)] border bg-[var(--cp-panel)] py-2.5 pl-10 pr-3 text-[var(--cp-ink)] outline-none transition focus:ring-2 ${tipoAccent.ring}`}
            >
              <option value="">Selecione</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </FieldShell>

          {/* Produto */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--cp-text-muted)]">Produto *</label>
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
                    <span className="text-[var(--cp-ink)]">{p.produto || p.nome}</span>
                    <span className="font-data text-xs text-[var(--cp-text-muted)]">
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
              className="w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] py-2.5 pl-10 pr-3 font-data text-[var(--cp-ink)] outline-none transition placeholder:font-sans placeholder:text-[var(--cp-text-muted)] focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
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
                className="w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] py-2.5 pl-10 pr-3 font-data text-[var(--cp-ink)] outline-none transition placeholder:font-sans placeholder:text-[var(--cp-text-muted)] focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
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
                  className="w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel-alt)] py-2.5 pl-10 pr-3 font-data text-[var(--cp-text-muted)] outline-none"
                />
              </FieldShell>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--cp-text-muted)]">Ajuste no Valor de Venda</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <SlidersHorizontal size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cp-text-muted)]" />
                    <select
                      value={tipoAjuste} onChange={(e) => setTipoAjuste(e.target.value)}
                      className="w-full appearance-none rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] py-2.5 pl-10 pr-3 text-[var(--cp-ink)] outline-none transition focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
                    >
                      <option value="acrescimo">Acrescimo</option>
                      <option value="desconto">Desconto</option>
                    </select>
                  </div>
                  <input
                    type="number" placeholder="Valor" value={ajusteValor} onChange={(e) => setAjusteValor(e.target.value)}
                    className="flex-[2] rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] px-3 py-2.5 font-data text-[var(--cp-ink)] outline-none transition placeholder:font-sans placeholder:text-[var(--cp-text-muted)] focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
                  />
                </div>
                <small className="mt-1 block font-data text-[var(--cp-text-muted)]">
                  Valor final unitario: R$ {getValorFinalUnit().toFixed(2)}
                </small>
                {/* O que vai ser gravado continua sendo o UNITÁRIO — o total é
                    só conferência antes de lançar. Sem ele, quem vendia 2
                    unidades via "R$ 350,00" na tela e não tinha onde confirmar
                    os R$ 700,00 da venda. Some com 1 unidade (seria repetir o
                    mesmo número duas vezes). */}
                {qtdLancada > 1 && (
                  <small className="mt-0.5 block font-data font-semibold text-[var(--cp-ink)]">
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
                className="w-full appearance-none rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] py-2.5 pl-10 pr-3 text-[var(--cp-ink)] outline-none transition focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
              >
                <option value="">Selecione o vendedor</option>
                <option value="Ismael">Ismael</option>
                <option value="Gustavo">Gustavo</option>
              </select>
            </FieldShell>
          )}

          {/* Forma de pagamento (saída) */}
          {lancamento.tipo === "saida" && (
            <div>
              {/* O ícone do FieldShell é posicionado no CENTRO DO CONTEÚDO
                  (top-1/2 do wrapper). Enquanto o conteúdo é UMA linha ele cai
                  dentro do campo — que é o contrato dos outros cinco usos. O
                  checkbox e o nome do cliente moravam aqui dentro, triplicavam
                  a altura e empurravam o cartão para fora do select. Ficam de
                  fora: o campo é só o seletor. */}
              <FieldShell label="Forma de pagamento" icon={CreditCard}>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={lancamento.formaPagamento}
                    disabled={lancamento.fiado}
                    onChange={(e) => setLancamento((prev) => ({ ...prev, formaPagamento: e.target.value }))}
                    className="flex-1 appearance-none rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] py-2.5 pl-10 pr-3 text-[var(--cp-ink)] outline-none transition focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40 disabled:cursor-not-allowed disabled:bg-[var(--cp-panel-alt)] disabled:text-[var(--cp-text-muted)]"
                  >
                    <option value="">Selecione...</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="pix">Pix</option>
                    <option value="debito">Debito</option>
                    <option value="credito">Credito</option>
                  </select>

                  {!lancamento.fiado && lancamento.formaPagamento === "credito" && (
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-[var(--cp-text-muted)]">Parcelas</label>
                      <input
                        type="number" min="1" max="10" value={lancamento.parcelas}
                        onChange={(e) => setLancamento((prev) => ({ ...prev, parcelas: e.target.value }))}
                        onBlur={() => setLancamento((prev) => ({ ...prev, parcelas: clampParcelas(prev.parcelas) }))}
                        className="w-20 rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] px-3 py-2.5 font-data text-[var(--cp-ink)] outline-none transition focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
                      />
                    </div>
                  )}
                </div>
              </FieldShell>

              {/* Marcar fiado LIMPA a forma escolhida: deixá-la selecionada e
                  só ignorar no envio faria a tela afirmar um pagamento que não
                  aconteceu. */}
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-[var(--cp-ink)]">
                <input
                  type="checkbox"
                  checked={lancamento.fiado}
                  onChange={(e) => setLancamento((prev) => ({
                    ...prev,
                    fiado: e.target.checked,
                    formaPagamento: e.target.checked ? "" : prev.formaPagamento,
                    parcelas: e.target.checked ? 1 : prev.parcelas,
                    // Desmarcar apaga o nome: o campo some da tela, e um nome
                    // invisível seria enviado numa venda que não é mais fiado.
                    clienteFiado: e.target.checked ? prev.clienteFiado : "",
                  }))}
                  className="h-4 w-4 rounded-[var(--cp-r-checkbox)] border-[var(--cp-line)] text-[var(--cp-volt)] focus:ring-[var(--cp-volt)]/40"
                />
                <span className="font-medium">Fiado</span>
                <span className="text-[var(--cp-text-muted)]">— cliente leva agora e paga depois</span>
              </label>

              {lancamento.fiado && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={lancamento.clienteFiado}
                    onChange={(e) => setLancamento((prev) => ({ ...prev, clienteFiado: e.target.value }))}
                    maxLength={150}
                    placeholder="Nome do cliente (quem está devendo)"
                    aria-label="Nome do cliente da venda fiado"
                    className="w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-line)] bg-[var(--cp-panel)] px-3 py-2.5 text-[var(--cp-ink)] outline-none transition placeholder:text-[var(--cp-text-muted)] focus:border-[var(--cp-ink)] focus:ring-2 focus:ring-[var(--cp-volt)]/40"
                  />
                  <p className="mt-1 text-xs text-[var(--cp-text-muted)]">
                    A venda entra no faturamento normalmente e aparece em <strong>A Receber</strong>.
                    O preço usado é o parcelado. A forma de pagamento é informada ao dar baixa,
                    no Registro de Movimentação.
                  </p>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || produtos.length === 0 || bloqueadoPorMargem}
            title={bloqueadoPorMargem ? "Ajuste os preços de venda para concluir a entrada" : undefined}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--cp-r-lg)] border-[length:var(--cp-bw-02)] border-[var(--cp-ink)] bg-[var(--cp-volt)] shadow-[var(--cp-shadow-pill-active)] px-5 py-3 font-display font-extrabold text-[var(--cp-volt-ink)] transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
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
    <div className={`rounded-[var(--cp-r-xl)] border-[length:var(--cp-bw-12)] p-4 ${ok ? "border-[var(--cp-signal-green)] bg-[var(--cp-signal-green-bg)]" : "border-[var(--cp-signal-red)] bg-[var(--cp-signal-red-bg)]"}`}>
      <div className="flex items-center gap-2">
        <TrendingUp size={16} className={ok ? "text-[var(--cp-signal-green)]" : "text-[var(--cp-signal-red)]"} />
        <span className={`font-display text-sm font-bold ${ok ? "text-[var(--cp-signal-green)]" : "text-[var(--cp-signal-red)]"}`}>
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
        <p className="mt-3 text-xs font-medium text-[var(--cp-signal-red)]">
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
        <span className="font-medium text-[var(--cp-ink)]">
          {label}: <span className="font-data">{brl(preco)}</span>
        </span>
        <span className={`font-data font-semibold ${abaixo ? "text-[var(--cp-signal-red)]" : "text-[var(--cp-signal-green)]"}`}>
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
            className="w-full rounded-[var(--cp-r-lg)] border border-[var(--cp-signal-red)] bg-[var(--cp-panel)] px-3 py-2 font-data text-sm text-[var(--cp-ink)] outline-none transition placeholder:font-sans placeholder:text-[var(--cp-text-muted)] focus:border-[var(--cp-signal-red)] focus:ring-2 focus:ring-[var(--cp-signal-red)]/30"
          />
          <small className="mt-1 block text-xs text-[var(--cp-text-muted)]">
            Atual: {brl(precoAtual)}. Você escolhe o novo valor — o mínimo para {MARGEM_MINIMA_PCT}% é {brl(minimo)}.
          </small>
        </div>
      )}
    </div>
  );
}

function FieldShell({ label, icon: Icon, iconClass = "text-[var(--cp-text-muted)]", children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--cp-text-muted)]">{label}</label>
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
      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-[var(--cp-r-full)] px-4 py-2.5 font-display text-sm font-bold transition-colors ${
        active
          ? "border-[length:var(--cp-bw-02)] border-[var(--cp-ink)] bg-[var(--cp-chip-active-bg)] text-[var(--cp-chip-active-fg)] shadow-[var(--cp-shadow-pill-active)]"
          : "border-[length:var(--cp-bw-12)] border-[var(--cp-ink)] bg-[var(--cp-panel)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-panel-alt)]"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
