import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search, PackageOpen, ChevronDown, Wrench, Trash2, Package, Pencil, AlertTriangle,
} from "lucide-react";
import { SomRegistroAPI } from "../../services/somRegistro";
import { PedidoSomAPI } from "../../services/pedidoSom";
import { MovSomAPI } from "../../services/movimentacoesSom";
import { EstoqueSomAPI } from "../../services/estoqueSom";
import { InventarioAPI } from "../../services/inventario";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { getRole } from "../../services/auth";
import { usaPrecoParcelado, rotuloFormaSom, parcelasDoRotulo, clampParcelas } from "../../utils/precos";
import { fmtBRL } from "../../utils/moeda";
import {
  ATALHOS, FILTROS, atalhoDoIntervalo, dataBR, hojeBRT, horaBRT, intervaloDoAtalho,
  lerPeriodoDaUrl, rotuloDia, somaDias,
} from "../../utils/registroSom";
import FormEdicaoPedido from "./FormEdicaoPedido";
import "./RegistroSom.css";

function fmtDataHora(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const chipCls = (ativo) =>
  `rsom-chip flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
    ativo
      ? "bg-amber-400 text-slate-900 shadow-sm"
      : "border border-amber-300 bg-white text-amber-600 hover:bg-amber-50"
  }`;

/**
 * Busca a janela de blocos a partir de `ate`, encadeando proximoAte.
 *
 * `piso` = primeiro dia que a janela JÁ cobria. Sem ele busca um bloco só (carga
 * inicial); com ele continua até cobrir de novo o que o usuário tinha na tela —
 * é como "recarregar a janela atual" depois de editar sem perder o "Carregar
 * mais" que ele já tinha clicado. O resumo do período é o do PRIMEIRO bloco
 * (intervalo inteiro); os seguintes cobrem só de..proximoAte.
 */
async function buscarJanela({ de, ate, filtro, q, piso }) {
  let cursor = ate;
  let resumoPeriodo = null;
  let proximoAte = null;
  const dias = [];
  do {
    const res = await SomRegistroAPI.buscar({ de, ate: cursor, filtro, q });
    if (!resumoPeriodo) resumoPeriodo = res.resumoPeriodo;
    dias.push(...(res.dias || []));
    proximoAte = res.proximoAte;
    cursor = proximoAte;
  } while (cursor && piso && cursor >= piso);
  return { dias, resumoPeriodo, proximoAte };
}

export default function RegistroSom() {
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = getRole() === "admin";

  const [params, setParams] = useSearchParams();
  const hoje = hojeBRT();
  const { de, ate, filtro } = lerPeriodoDaUrl(params, hoje);

  // "Personalizado" precisa de estado próprio: clicar nele não muda as datas,
  // então só pela URL não dá para saber que os inputs devem aparecer.
  const [custom, setCustom] = useState(() => atalhoDoIntervalo(de, ate, hoje) === "personalizado");
  const atalho = custom ? "personalizado" : atalhoDoIntervalo(de, ate, hoje);

  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  const [dias, setDias] = useState([]);
  const [resumoPeriodo, setResumoPeriodo] = useState(null);
  const [proximoAte, setProximoAte] = useState(null);
  const [loading, setLoading] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [expandido, setExpandido] = useState(() => new Set());

  // Edição de pedido: null = ninguém editando.
  const [edicao, setEdicao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [produtosSom, setProdutosSom] = useState([]);
  const [inventarioAtivo, setInventarioAtivo] = useState(false);

  // Descarta resposta de requisição que ficou para trás (troca rápida de filtro).
  const reqId = useRef(0);
  // O que está na tela, para o "recarregar" saber até onde reconstruir.
  const estado = useRef({ proximoAte: null });
  estado.current.proximoAte = proximoAte;

  // Busca com debounce: um request por pausa de digitação, não por tecla.
  useEffect(() => {
    const t = setTimeout(() => setQ(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Período, filtro ou busca mudaram: lista do ZERO.
  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setErrorMsg("");
    setExpandido(new Set());
    setEdicao(null);
    buscarJanela({ de, ate, filtro, q })
      .then((r) => {
        if (id !== reqId.current) return;
        setDias(r.dias);
        setResumoPeriodo(r.resumoPeriodo);
        setProximoAte(r.proximoAte);
      })
      .catch((e) => {
        if (id !== reqId.current) return;
        console.error("GET /som/registro ERRO:", e);
        setErrorMsg(e?.response?.data?.message || e?.message || "Falha ao carregar o registro");
        setDias([]);
        setResumoPeriodo(null);
        setProximoAte(null);
      })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [de, ate, filtro, q]);

  // Depois de editar/excluir: refaz a janela que o usuário já tinha aberta.
  const recarregar = useCallback(async () => {
    const id = ++reqId.current;
    const prox = estado.current.proximoAte;
    try {
      const r = await buscarJanela({ de, ate, filtro, q, piso: prox ? somaDias(prox, 1) : de });
      if (id !== reqId.current) return;
      setDias(r.dias);
      setResumoPeriodo(r.resumoPeriodo);
      setProximoAte(r.proximoAte);
    } catch (e) {
      if (id !== reqId.current) return;
      toast.error(e?.response?.data?.message || "Falha ao atualizar a lista.");
    }
  }, [de, ate, filtro, q, toast]);

  async function carregarMais() {
    if (!proximoAte || carregandoMais) return;
    const id = reqId.current;
    setCarregandoMais(true);
    try {
      const res = await SomRegistroAPI.buscar({ de, ate: proximoAte, filtro, q });
      if (id !== reqId.current) return; // período/filtro mudou no meio
      setDias((prev) => [...prev, ...(res.dias || [])]);
      setProximoAte(res.proximoAte);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao carregar mais dias.");
    } finally {
      setCarregandoMais(false);
    }
  }

  // Só admin edita pedido: catálogo e aviso de inventário para o formulário.
  useEffect(() => {
    if (!isAdmin) return;
    let vivo = true;
    Promise.all([
      EstoqueSomAPI.listar({ q: "" }),
      // Inventário em andamento não bloqueia nada — mas mexer no estoque no meio
      // de uma contagem gera divergência na conferência, e quem edita precisa
      // saber disso antes.
      InventarioAPI.ativa("SOM").catch(() => null),
    ])
      .then(([prods, conf]) => {
        if (!vivo) return;
        setProdutosSom(prods || []);
        setInventarioAtivo(!!conf);
      })
      .catch((e) => console.error("Carregar apoio da edição erro:", e));
    return () => { vivo = false; };
  }, [isAdmin]);

  /* ----- período / filtro na URL ----- */
  function atualizarUrl(patch) {
    const next = { de, ate, filtro, ...patch };
    const p = new URLSearchParams();
    p.set("de", next.de);
    p.set("ate", next.ate);
    if (next.filtro !== "tudo") p.set("filtro", next.filtro);
    setParams(p, { replace: true });
  }

  function escolherAtalho(key) {
    setCustom(false);
    atualizarUrl(intervaloDoAtalho(key, hoje));
  }
  function mudarDe(v) {
    if (!v) return;
    atualizarUrl({ de: v, ate: ate < v ? v : ate });
  }
  function mudarAte(v) {
    if (!v) return;
    atualizarUrl({ ate: v, de: de > v ? v : de });
  }

  function toggleExpandir(id) {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /* ----- edição / exclusão de pedido ----- */
  function abrirEdicao(p) {
    // O banco guarda o RÓTULO ("Crédito 10x"); o select trabalha com a forma
    // base. parcelas pode faltar em pedido antigo (anterior à coluna): tenta o
    // número embutido no rótulo antes de cair no 1.
    const credito = usaPrecoParcelado(p.forma_pagamento);
    const itens = p.itens || [];
    setEdicao({
      id: p.id,
      veiculo: p.veiculo || "",
      formaBase: credito ? "Crédito" : (p.forma_pagamento || ""),
      parcelas: credito ? (p.parcelas ?? parcelasDoRotulo(p.forma_pagamento) ?? 1) : 1,
      periodoFechado: !!p.periodo_fechado,
      dataPedido: p.created_at,
      // Serviços: o valor e a % GRAVADOS de cada um vão junto no salvamento,
      // para que item não tocado nunca seja reprecificado nem recomissionado
      // pela config de hoje.
      servicos: itens.filter((it) => it.tipo === "MAO_OBRA").map((it, i) => ({
        key: `s${i}`,
        descricao: it.descricao || "",
        quantidade: Number(it.quantidade) || 1,
        mao_obra_unit: it.mao_obra_unit != null ? String(it.mao_obra_unit) : "",
        percentual_comissao: it.percentual_comissao != null ? String(it.percentual_comissao) : "",
        // item que já existe chega com a % gravada: não re-sugerir por cima.
        pctTocado: it.percentual_comissao != null,
      })),
      tinhaServicos: itens.some((it) => it.tipo === "MAO_OBRA"),
      // Produtos: editáveis. quantidadeOriginal fica guardada para o saldo
      // efetivo — as unidades deste item voltam ao estoque antes da nova baixa,
      // então o "Estoque atual" do catálogo não é o limite real.
      produtos: itens.filter((it) => it.tipo === "PRODUTO").map((it, i) => ({
        key: `p${i}`,
        item_id: it.id,
        produto_id: it.produto_id ? String(it.produto_id) : "",
        descricao: it.descricao,
        quantidade: Number(it.quantidade) || 0,
        quantidadeOriginal: Number(it.quantidade) || 0,
        // Preço GRAVADO: reenviar o valor da época é o que impede o pedido de
        // ser reprecificado pela tabela de hoje.
        valor_unit: it.valor_unit != null ? String(it.valor_unit) : "",
        mao_obra_unit: it.mao_obra_unit != null ? String(it.mao_obra_unit) : "",
      })),
      tinhaProdutos: itens.some((it) => it.tipo === "PRODUTO"),
      servicosDirty: false,
      maoObraProdutosDirty: false,
      produtosDirty: false,
    });
  }

  async function salvarEdicao() {
    if (!edicao) return;

    // Esvaziar a lista apaga mão de obra e derruba a comissão do pedido — não é
    // o tipo de coisa que pode acontecer por um clique distraído no "x".
    if (edicao.servicosDirty && edicao.servicos.length === 0 && edicao.tinhaServicos) {
      const ok = await confirm({
        title: "Remover todos os serviços",
        message: "Remover TODOS os serviços deste pedido? A mão de obra e a comissão do Joel deste pedido vão a zero.",
        confirmLabel: "Remover",
        cancelLabel: "Cancelar",
      });
      if (!ok) return;
    }

    // Tirar todos os produtos devolve o estoque inteiro e transforma a venda em
    // serviço puro — merece a mesma confirmação dos serviços.
    if (edicao.produtosDirty && edicao.produtos.length === 0 && edicao.tinhaProdutos) {
      const ok = await confirm({
        title: "Remover todos os produtos",
        message: "Remover TODOS os produtos deste pedido? As unidades voltam ao estoque e o pedido fica só com os serviços.",
        confirmLabel: "Remover",
        cancelLabel: "Cancelar",
      });
      if (!ok) return;
    }

    // Mexer em estoque no meio de uma contagem faz a conferência acusar
    // divergência que não existe. Avisa, não bloqueia.
    if (edicao.produtosDirty && inventarioAtivo) {
      const ok = await confirm({
        title: "Inventário de Som em andamento",
        message: "Há um inventário de Som em andamento. Esta alteração mexe no estoque e pode gerar divergência na contagem. Continuar?",
        confirmLabel: "Continuar",
        cancelLabel: "Cancelar",
      });
      if (!ok) return;
    }

    // Quinzena já apurada: permitido, mas com confirmação explícita. O snapshot
    // pago não muda — o pedido é que passa a divergir dele.
    if (edicao.periodoFechado && (edicao.servicosDirty || edicao.maoObraProdutosDirty || edicao.produtosDirty)) {
      const ok = await confirm({
        title: "Quinzena já apurada",
        message:
          `Este pedido é de ${fmtDataHora(edicao.dataPedido)}, numa quinzena que já foi apurada.\n\n` +
          "A alteração NÃO muda a comissão que já foi paga. O pedido passará a divergir daquela apuração.",
        confirmLabel: "Editar mesmo assim",
        cancelLabel: "Cancelar",
      });
      if (!ok) return;
    }

    const credito = edicao.formaBase === "Crédito";
    setSalvando(true);
    try {
      await PedidoSomAPI.atualizar(edicao.id, {
        veiculo: edicao.veiculo.trim() || null,
        // Rótulo pela regra única (utils/precos.js) — a mesma do PedidoSomForm.
        forma_pagamento: rotuloFormaSom(edicao.formaBase, clampParcelas(edicao.parcelas)) || null,
        ...(credito ? { parcelas: clampParcelas(edicao.parcelas) } : {}),
        // Só manda itens quando foram mexidos: sem isso, editar o veículo
        // dispararia a reagregação e recalcularia a comissão à toa.
        ...(edicao.servicosDirty ? {
          itens_servico: edicao.servicos.map((s) => ({
            descricao: s.descricao.trim() || undefined,
            quantidade: Number(s.quantidade) || 1,
            ...(s.mao_obra_unit !== "" ? { mao_obra_unit: Number(s.mao_obra_unit) } : {}),
            ...(s.percentual_comissao !== "" ? { percentual_comissao: Number(s.percentual_comissao) } : {}),
          })),
        } : {}),
        // Mão de obra legada só faz sentido nos itens que sobreviveram; se os
        // produtos foram reescritos, os ids antigos deixam de existir.
        ...(edicao.maoObraProdutosDirty && !edicao.produtosDirty ? {
          mao_obra_produtos: edicao.produtos
            .filter((p) => p.item_id && p.mao_obra_unit !== "")
            .map((p) => ({ item_id: p.item_id, mao_obra_unit: Number(p.mao_obra_unit) })),
        } : {}),
        ...(edicao.produtosDirty ? {
          itens_produto: edicao.produtos.map((p) => ({
            ...(p.item_id ? { item_id: p.item_id } : {}),
            produto_id: Number(p.produto_id),
            quantidade: Number(p.quantidade) || 1,
            valor_unit: Number(p.valor_unit) || 0,
          })),
        } : {}),
      });
      toast.success("Pedido atualizado.");
      setEdicao(null);
      recarregar();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao atualizar pedido.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirPedido(p) {
    const ok = await confirm({
      title: "Excluir pedido",
      message: "As baixas de estoque deste pedido serão revertidas. Esta ação não pode ser desfeita. Continuar?",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    try {
      await PedidoSomAPI.remover(p.id);
      toast.success("Pedido excluído.");
      recarregar();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao excluir pedido.");
    }
  }

  // Exclusão de movimentação avulsa (saída/entrada). O backend reverte o
  // agregado de estoque na mesma transação.
  //
  // O QUE A EXCLUSÃO DE ENTRADA *NÃO* FAZ: devolver o custo. Uma entrada pode
  // ter reposto custo e preços do produto, e o estorno mexe só na quantidade
  // (utils/estorno.js). O aviso sai em TODA entrada, e não só nas que mexeram
  // em preço, porque isso não é sabível: nada no banco registra a diferença nos
  // lançamentos antigos. Um aviso condicional seria pior — a ausência dele
  // passaria a significar "o custo volta", que é falso.
  async function excluirAvulsa(m) {
    const venda = m.tipo === "SAIDA";
    const ok = await confirm({
      title: venda ? "Excluir venda" : "Excluir entrada",
      message:
        `${m.produto}${m.modelo ? ` - ${m.modelo}` : ""} · ${m.quantidade} un.\n\n` +
        `O estoque será ${venda ? "devolvido" : "reduzido"} em ${m.quantidade} un.\n\n` +
        (venda
          ? ""
          : "Se este lançamento atualizou o custo ou os preços do produto, eles NÃO " +
            "voltam ao que eram — o produto continua com os valores de hoje. Para " +
            "corrigir, edite o produto ou faça um novo lançamento de entrada.\n\n") +
        "Esta ação não pode ser desfeita. Continuar?",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    try {
      await MovSomAPI.remover(m.id);
      toast.success(venda ? "Venda excluída." : "Entrada excluída.");
      recarregar();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao excluir movimentação.");
    }
  }

  const colCount = 6 + (isAdmin ? 1 : 0);
  const vazio = !loading && dias.length === 0;

  return (
    <div className="rsom">
      {/* Busca e filtros */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Buscar produto, veículo ou serviço..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filtro === f.key}
              onClick={() => atualizarUrl({ filtro: f.key })}
              className={chipCls(filtro === f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Período */}
      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        {ATALHOS.map((a) => (
          <button
            key={a.key}
            type="button"
            aria-pressed={atalho === a.key}
            onClick={() => escolherAtalho(a.key)}
            className={chipCls(atalho === a.key)}
          >
            {a.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={atalho === "personalizado"}
          onClick={() => setCustom(true)}
          className={chipCls(atalho === "personalizado")}
        >
          Personalizado
        </button>
        {atalho === "personalizado" && (
          <span className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="date" value={de} max={ate} aria-label="Data inicial"
              onChange={(e) => mudarDe(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-amber-400"
            />
            até
            <input
              type="date" value={ate} min={de} aria-label="Data final"
              onChange={(e) => mudarAte(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-amber-400"
            />
          </span>
        )}
      </div>

      {/* Resumo do período — fixo acima da lista, do intervalo INTEIRO */}
      <div className="rsom-resumo mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm text-white">
        <span className="font-semibold">
          {de === ate ? dataBR(de) : `${dataBR(de)} a ${dataBR(ate)}`}
        </span>
        <span data-testid="resumo-periodo">
          {resumoPeriodo
            ? (
              <>
                <strong>{resumoPeriodo.pedidos}</strong> pedido{resumoPeriodo.pedidos === 1 ? "" : "s"}
                {" · "}<strong>{fmtBRL(resumoPeriodo.total)}</strong>
                {isAdmin && resumoPeriodo.comissao != null && (
                  <span className="ml-3 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-semibold text-slate-900">
                    Joel {fmtBRL(resumoPeriodo.comissao)}
                  </span>
                )}
              </>
            )
            : "—"}
        </span>
      </div>

      {errorMsg && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}
      {loading && <p className="mt-3 text-sm text-slate-400">Carregando...</p>}

      <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-800 text-left text-xs font-semibold uppercase tracking-wide text-white">
                <th className="px-3 py-2.5">Hora</th>
                <th className="px-3 py-2.5">Descrição</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Qtd.</th>
                <th className="px-3 py-2.5">Valor</th>
                <th className="px-3 py-2.5">Forma de Pagamento</th>
                {isAdmin && <th className="px-3 py-2.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {dias.map((dia) => (
                <React.Fragment key={dia.data}>
                  <tr className="rsom-dia">
                    <td colSpan={colCount} className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-slate-800">{rotuloDia(dia.data)}</span>
                        <span className="text-xs font-medium text-slate-600">
                          {dia.resumo.pedidos > 0
                            ? `${dia.resumo.pedidos} pedido${dia.resumo.pedidos === 1 ? "" : "s"} · ${fmtBRL(dia.resumo.total)}`
                            : "Sem pedidos"}
                          {isAdmin && dia.resumo.comissao != null && dia.resumo.pedidos > 0 && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                              Joel {fmtBRL(dia.resumo.comissao)}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {dia.linhas.map((l) => (
                    l.kind === "pedido"
                      ? (
                        <LinhaPedido
                          key={l.key}
                          pedido={l.pedido}
                          aberto={expandido.has(l.pedido.id)}
                          onToggle={() => toggleExpandir(l.pedido.id)}
                          isAdmin={isAdmin}
                          colCount={colCount}
                          edicao={edicao}
                          setEdicao={setEdicao}
                          produtosSom={produtosSom}
                          inventarioAtivo={inventarioAtivo}
                          salvando={salvando}
                          onEditar={abrirEdicao}
                          onSalvar={salvarEdicao}
                          onExcluir={excluirPedido}
                        />
                      )
                      : (
                        <LinhaAvulsa
                          key={l.key}
                          hora={horaBRT(l.data)}
                          mov={l.mov}
                          isAdmin={isAdmin}
                          onExcluir={excluirAvulsa}
                        />
                      )
                  ))}
                </React.Fragment>
              ))}

              {vazio && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <PackageOpen size={44} strokeWidth={1.4} className="text-slate-300" />
                      <p className="text-sm font-medium text-slate-500">Nada registrado neste período.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {proximoAte && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={carregarMais}
            disabled={carregandoMais}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {carregandoMais ? "Carregando..." : `Carregar mais (até ${dataBR(proximoAte)} e antes)`}
          </button>
        </div>
      )}
    </div>
  );
}

/** "#58 Instalação · Mobi" — a linha do pedido; os itens só ao expandir. */
function LinhaPedido({
  pedido: p, aberto, onToggle, isAdmin, colCount, edicao, setEdicao, produtosSom,
  inventarioAtivo, salvando, onEditar, onSalvar, onExcluir,
}) {
  const tdBase = "px-3 py-2.5 text-slate-700";
  const nItens = p.itens?.length ?? 0;
  return (
    <>
      <tr
        onClick={onToggle}
        className="rsom-pedido cursor-pointer border-t border-slate-100 bg-purple-50 transition-colors hover:bg-purple-100/70"
      >
        <td className={`${tdBase} whitespace-nowrap`}>
          <span className="inline-flex items-center gap-1">
            <ChevronDown
              size={14}
              className={`text-purple-500 transition-transform ${aberto ? "" : "-rotate-90"}`}
            />
            {horaBRT(p.created_at)}
          </span>
        </td>
        <td className={`${tdBase} font-semibold text-slate-800`}>
          #{p.id} Instalação · {p.veiculo || <span className="font-normal text-slate-400">sem veículo</span>}
        </td>
        <td className={tdBase}>
          <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
            PEDIDO
          </span>
        </td>
        <td className={`${tdBase} whitespace-nowrap`}>{nItens} {nItens === 1 ? "item" : "itens"}</td>
        <td className={`${tdBase} font-bold text-slate-800`}>{fmtBRL(p.valor_total)}</td>
        <td className={tdBase}>{p.forma_pagamento || "—"}</td>
        {isAdmin && <td className={tdBase} />}
      </tr>

      {aberto && (
        <tr className="bg-purple-50/40">
          <td colSpan={colCount} className="px-4 py-3">
            <div className="rounded-lg border border-purple-100 bg-white p-3">
              <ul className="divide-y divide-slate-100">
                {(p.itens || []).map((it) => {
                  // Serviço não tem preço de peça: valor_unit/valor_total são 0 e
                  // o dinheiro dele vive em mao_obra_*.
                  const servico = it.tipo === "MAO_OBRA";
                  // Mão de obra é dado de admin (o backend já omite para os demais).
                  const oculto = servico && !isAdmin;
                  const unit = servico ? it.mao_obra_unit : it.valor_unit;
                  const total = servico ? it.mao_obra_total : it.valor_total;
                  return (
                    <li key={it.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        {servico
                          ? <Wrench size={14} className="text-amber-500" />
                          : <Package size={14} className="text-slate-400" />}
                        <span className="text-slate-700">{it.descricao}</span>
                        <span className="text-xs text-slate-400">
                          {oculto ? `${it.quantidade} un.` : `${it.quantidade} × ${fmtBRL(unit)}`}
                          {servico && !oculto && " (mão de obra)"}
                        </span>
                      </span>
                      <span className="font-semibold text-slate-700">
                        {oculto ? "—" : fmtBRL(total)}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
                <div className="text-slate-600">
                  {/* Mão de obra e comissão são dados de admin. O backend já omite
                      esses campos; o guard isAdmin é defesa extra no front. */}
                  {isAdmin && Number(p.valor_mao_obra) > 0 && (
                    <span className="mr-4">
                      Mão de obra: <strong>{fmtBRL(p.valor_mao_obra)}</strong>
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        Joel {fmtBRL(p.comissao_joel)}
                      </span>
                    </span>
                  )}
                  <span>Total: <strong className="text-slate-800">{fmtBRL(p.valor_total)}</strong></span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEditar(p); }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <Pencil size={14} /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onExcluir(p); }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                    >
                      <Trash2 size={14} /> Excluir pedido
                    </button>
                  </div>
                )}
              </div>

              {isAdmin && edicao?.id === p.id && (
                <FormEdicaoPedido
                  edicao={edicao}
                  setEdicao={setEdicao}
                  produtosSom={produtosSom}
                  inventarioAtivo={inventarioAtivo}
                  salvando={salvando}
                  onSalvar={onSalvar}
                />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Entrada ou saída sem pedido. */
function LinhaAvulsa({ hora, mov: m, isAdmin, onExcluir }) {
  const entrada = m.tipo === "ENTRADA";
  const rowBg = entrada ? "bg-green-50 hover:bg-green-100/70" : "bg-red-50 hover:bg-red-100/70";
  const tdBase = "px-3 py-2.5 text-slate-700";
  // Saída sem valor: a venda saiu do estoque mas não entrou receita em lugar
  // nenhum (o faturamento do Som vem só de pedido). Entrada vale R$ 0,00 por
  // desenho — o campo nem existe no lançamento —, então o alerta é só de saída.
  const semValor = !entrada && m.valor === 0;
  // Órfã = motivo de pedido, mas o pedido não existe mais. O DELETE da rota
  // recusa qualquer movimentação com esse motivo, então não há lixeira.
  const podeExcluir = isAdmin && !m.orfa;
  return (
    <tr className={`rsom-avulsa border-t border-slate-100 transition-colors ${rowBg}`}>
      <td className={`${tdBase} whitespace-nowrap`}>{hora}</td>
      <td className={`${tdBase} font-semibold text-slate-800`}>
        {m.produto}
        {m.modelo && <span className="ml-1.5 font-normal text-slate-500">{m.modelo}</span>}
        {m.orfa && (
          <span
            className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600"
            title="Esta saída foi gerada por um pedido que não existe mais."
          >
            órfã
          </span>
        )}
      </td>
      <td className={tdBase}>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          entrada ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
        }`}>
          {entrada ? "ENTRADA" : "SAÍDA"}
        </span>
      </td>
      <td className={`${tdBase} whitespace-nowrap`}>{m.quantidade} un.</td>
      <td className={`${tdBase} whitespace-nowrap`}>
        <span className="inline-flex items-center gap-1.5">
          {fmtBRL(m.valor)}
          {semValor && (
            <AlertTriangle
              size={14}
              className="text-amber-500"
              role="img"
              aria-label="Saída sem valor"
              title="Saída avulsa com valor R$ 0,00 — não entrou receita."
            />
          )}
        </span>
      </td>
      <td className={tdBase}>{entrada ? "Compra de produto" : "—"}</td>
      {isAdmin && (
        <td className={`${tdBase} text-right`}>
          {podeExcluir && (
            <button
              type="button"
              onClick={() => onExcluir(m)}
              title="Excluir movimentação"
              aria-label={`Excluir movimentação de ${m.produto}`}
              className="inline-flex items-center rounded-lg border border-red-200 bg-white px-2 py-1.5 text-red-600 transition-colors hover:bg-red-50"
            >
              <Trash2 size={14} />
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
