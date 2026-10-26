import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ClipboardList, Search, Battery, Music, PackageOpen, ChevronLeft, ChevronRight,
  Trash2, Pencil, Clock,
} from "lucide-react";
import { MovAPI } from "../../services/movimentacoes";
import { EstoqueAPI } from "../../services/estoque";
import { InventarioAPI } from "../../services/inventario";
import ProdutoSearchSelect from "../../components/ProdutoSearchSelect/ProdutoSearchSelect";
import { ESTOQUE_TIPOS } from "../../services/estoqueTipos";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { getRole, temLinha } from "../../services/auth";
import { clampParcelas } from "../../utils/precos";
import { urlTemPeriodoSom } from "../../utils/registroSom";
import RegistroSom from "./RegistroSom";

const PAGE_SIZE = 20;

/* ===== helpers ===== */
function fmtDataHora(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const fmtMoney = (n) => `R$ ${(Number(n) || 0).toFixed(2)}`;

// Rótulo da forma de pagamento a partir das colunas do banco (forma_pagamento +
// parcelas). Crédito mostra o nº de parcelas: "Crédito 10x".
function rotuloForma(forma, parcelas) {
  if (!forma) return "";
  if (forma === "credito") {
    const n = Number(parcelas || 1);
    return n > 1 ? `Crédito ${n}x` : "Crédito à vista";
  }
  return capitalize(forma);
}

function mapMovToUi(row) {
  const tipo = String(row?.tipo || "").toUpperCase() === "ENTRADA" ? "ENTRADA" : "SAIDA";
  // ENTRADA é compra de produto pro estoque — não tem forma de pagamento de
  // venda. Mostra rótulo fixo.
  const forma = tipo === "ENTRADA"
    ? "Compra de produto"
    : (rotuloForma(row?.forma_pagamento, row?.parcelas) || (row?.motivo ? capitalize(row.motivo) : ""));
  return {
    id: row?.id,
    data: row?.data_movimentacao,
    produto: row?.estoque?.produto ?? "—",
    modelo: row?.estoque?.modelo ?? "—",
    tipo,
    quantidade: Number(row?.quantidade ?? 0),
    valorUnitario: Number(row?.valor_final ?? 0),
    vendedor: row?.vendedor || "",
    formaPagamento: forma,
    // Cru, para a edição de venda de Baterias: o rótulo acima é de exibição e
    // não volta para o payload.
    produtoId: row?.produto_id ?? null,
    formaBase: row?.forma_pagamento || "",
    parcelas: row?.parcelas ?? null,
    garantiaId: row?.garantia_id ?? null,
    periodoFechado: !!row?.periodo_fechado,
    // Ausente = PAGO: movimentação de Som não tem a coluna, e uma linha antiga
    // de Baterias nasceu antes dela existir. Em ambos os casos "está pago" é a
    // leitura certa — o fiado é sempre explícito.
    statusPagamento: row?.status_pagamento || "PAGO",
    dataPagamento: row?.data_pagamento ?? null,
    // "" e não null: o campo alimenta um input controlado na edição, e null
    // faria o React alternar entre não-controlado e controlado.
    clienteFiado: row?.cliente_fiado || "",
  };
}

// Vendedores que ganham comissão por bateria. Espelha VENDEDORES_BATERIA do
// backend, que é quem manda: apurar() casa o nome por igualdade exata, e o PUT
// recusa qualquer valor fora desta lista.
const VENDEDORES_BATERIA = ["Gustavo", "Ismael"];

const saldoDoProduto = (p) => Number(
  p?.em_estoque ?? (Number(p?.qtd_inicial || 0) + Number(p?.entradas || 0) - Number(p?.saidas || 0)),
);

export default function RegistroMovimentacoes() {
  const toast = useToast();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = getRole() === "admin"; // exclusão e edição de venda são restritas a admin no backend
  // Escopo de linha: só as linhas que o usuário opera aparecem no toggle.
  const verBaterias = temLinha("baterias");
  const verSom = temLinha("som");

  const [rows, setRows] = useState([]);
  const [filtro, setFiltro] = useState("");
  // Link do Registro do Som (?de=&ate=&filtro=) tem que abrir NO Som, mesmo para
  // quem opera as duas linhas e cairia em Baterias por padrão.
  const [tipoEstoque, setTipoEstoque] = useState(() => {
    if (verSom && (!verBaterias || urlTemPeriodoSom(searchParams))) return ESTOQUE_TIPOS.SOM;
    return ESTOQUE_TIPOS.BATERIAS;
  });
  // Filtro "Fiados em aberto". Vai como parâmetro para o backend — a lista
  // pagina de 20 em 20, e filtrar o que já veio esconderia os fiados das outras
  // páginas enquanto o rodapé seguisse contando a lista inteira.
  const [soFiado, setSoFiado] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Edição de VENDA de Baterias: null = ninguém editando.
  const [edicaoMov, setEdicaoMov] = useState(null);
  const [produtosBaterias, setProdutosBaterias] = useState([]);
  const [inventarioBateriasAtivo, setInventarioBateriasAtivo] = useState(false);

  // A linha Som tem tela própria (RegistroSom: pedidos e avulsas por dia, com
  // paginação por período). Tudo daqui para baixo é Baterias.
  const isSom = tipoEstoque === ESTOQUE_TIPOS.SOM;

  // `fiado` é parâmetro, e não leitura do estado: este useCallback tem deps []
  // de propósito (identidade estável), então ler soFiado aqui dentro pegaria o
  // valor congelado da primeira renderização. Todo call site tem que passá-lo —
  // esquecer um faz o filtro se desligar sozinho depois de salvar.
  const carregar = useCallback(async (q, pg, fiado) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await MovAPI.listarPagina({
        q,
        page: pg,
        pageSize: PAGE_SIZE,
        status_pagamento: fiado ? "FIADO" : undefined,
      });
      setRows((res?.data || []).map((r) => mapMovToUi(r)));
      setPages(res?.pages || 1);
      setTotal(res?.total || 0);
    } catch (e) {
      console.error("GET movimentações ERRO:", e);
      setErrorMsg(e?.response?.data?.message || e?.message || "Falha ao carregar movimentações");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // soFiado entra aqui: ligar o filtro encolhe a lista, e ficar na página 3 de
  // uma lista que passou a ter 1 página mostraria uma tabela vazia.
  useEffect(() => { setPage(1); }, [filtro, tipoEstoque, soFiado]);

  // Apoio da edição de venda de Baterias — só admin, só na aba Baterias.
  useEffect(() => {
    if (!isAdmin || isSom) return;
    let vivo = true;
    Promise.all([
      EstoqueAPI.listar({ q: "" }),
      InventarioAPI.ativa("BATERIAS").catch(() => null),
    ])
      .then(([prods, conf]) => {
        if (!vivo) return;
        setProdutosBaterias(prods || []);
        setInventarioBateriasAtivo(!!conf);
      })
      .catch((e) => console.error("Carregar apoio da edição de Baterias erro:", e));
    return () => { vivo = false; };
  }, [isAdmin, isSom]);

  // Trocar de aba ou de página fecha o formulário aberto: o registro que ele
  // edita pode nem estar mais na lista.
  useEffect(() => { setEdicaoMov(null); }, [filtro, page, tipoEstoque, soFiado]);

  useEffect(() => {
    if (isSom) return undefined;
    const t = setTimeout(() => carregar(filtro, page, soFiado), 300);
    return () => clearTimeout(t);
  }, [filtro, page, isSom, soFiado, carregar]);

  function trocarLinha(key) {
    // Os parâmetros de período/filtro são do Registro do Som: sair dele limpa a
    // URL, senão o link da Baterias carregaria um período que não é dela.
    if (key !== ESTOQUE_TIPOS.SOM && searchParams.toString()) setSearchParams({}, { replace: true });
    setTipoEstoque(key);
  }

  const hasVendedor = useMemo(() => rows.some((r) => r.vendedor), [rows]);
  // +1 pela coluna de ações, que só existe para admin (quem pode excluir).
  const colCount = (hasVendedor ? 8 : 7) + (isAdmin ? 1 : 0);

  // ----- edição de VENDA de Baterias (Fase D da linha) -----
  function abrirEdicaoMov(r) {
    setEdicaoMov({
      id: r.id,
      produtoId: r.produtoId ? String(r.produtoId) : "",
      produtoIdOriginal: r.produtoId ? String(r.produtoId) : "",
      rotuloProduto: [r.produto, r.modelo].filter(Boolean).join(" - "),
      quantidade: r.quantidade,
      quantidadeOriginal: r.quantidade,
      valorUnitario: String(r.valorUnitario ?? ""),
      valorUnitarioOriginal: String(r.valorUnitario ?? ""),
      vendedor: r.vendedor || "",
      vendedorOriginal: r.vendedor || "",
      formaBase: r.formaBase || "",
      parcelas: r.parcelas ?? 1,
      periodoFechado: r.periodoFechado,
      statusPagamento: r.statusPagamento || "PAGO",
      statusPagamentoOriginal: r.statusPagamento || "PAGO",
      clienteFiado: r.clienteFiado || "",
      clienteFiadoOriginal: r.clienteFiado || "",
    });
  }

  async function salvarEdicaoMov() {
    const e = edicaoMov;
    if (!e) return;

    const qtd = Number(e.quantidade);
    if (!Number.isInteger(qtd) || qtd <= 0) {
      toast.error("Quantidade deve ser um inteiro maior que zero.");
      return;
    }
    if (!e.produtoId) {
      toast.error("Selecione o produto.");
      return;
    }

    const trocouProduto = e.produtoId !== e.produtoIdOriginal;
    const mudouQtd = qtd !== e.quantidadeOriginal;
    const valor = Number(e.valorUnitario);
    // O backend recusa (400) mudança de produto/quantidade sem valor unitário —
    // ele nunca puxa o preço atual do catálogo. Barrar aqui dá a mensagem na
    // hora, mas a regra que vale é a de lá.
    if ((trocouProduto || mudouQtd) && !(Number.isFinite(valor) && valor >= 0)) {
      toast.error("Informe o valor unitário ao mudar o produto ou a quantidade.");
      return;
    }

    // Quitar sem dizer COMO o cliente pagou joga a venda no balde
    // "sem forma de pagamento" do dashboard, onde ela fica com taxa zero e
    // superestima o lucro. A forma só existe neste momento — no lançamento do
    // fiado não havia nenhuma — então é aqui que ela tem que ser pedida.
    const quitando = e.statusPagamentoOriginal === "FIADO" && e.statusPagamento === "PAGO";
    if (quitando && !e.formaBase) {
      toast.error("Informe a forma de pagamento para dar baixa nesta venda fiado.");
      return;
    }

    // Segue fiado e sem dono: ou o campo foi apagado, ou é um fiado lançado
    // antes desta coluna existir. Sem isto o nome vazio viraria um payload sem
    // a chave, e o salvamento "daria certo" deixando a dívida anônima.
    if (e.statusPagamento === "FIADO" && !e.clienteFiado.trim()) {
      toast.error("Informe o nome do cliente desta venda fiado.");
      return;
    }

    // Mexer no estoque no meio de uma contagem faz a conferência divergir do
    // sistema — quem edita precisa saber antes, não depois.
    if ((trocouProduto || mudouQtd) && inventarioBateriasAtivo) {
      const ok = await confirm({
        title: "Inventário em andamento",
        message:
          "Há uma conferência de estoque de Baterias aberta. Alterar produto ou quantidade agora " +
          "muda o saldo do sistema no meio da contagem e vai gerar divergência. Continuar?",
        confirmLabel: "Editar mesmo assim",
        cancelLabel: "Cancelar",
      });
      if (!ok) return;
    }

    // Quinzena fechada: a comissão daquele período já foi apurada e paga, e o
    // snapshot NÃO é recalculado. Nomear quem recebeu é o ponto do aviso —
    // trocar o vendedor não devolve nem transfere o que já foi pago.
    if (e.periodoFechado) {
      const trocouVendedor = e.vendedor !== e.vendedorOriginal;
      const quem = e.vendedorOriginal || "o vendedor da época";
      const ok = await confirm({
        title: "Quinzena de comissão já fechada",
        message: trocouVendedor
          ? `A comissão desta venda já foi apurada e paga a ${quem}, e continuará paga a ${quem}. ` +
            `Passar a venda para ${e.vendedor || "outro vendedor"} não recalcula o período fechado — ` +
            "vale só daqui em diante. Continuar?"
          : `A comissão desta quinzena já foi apurada e paga a ${quem}. ` +
            "A alteração não muda o valor já pago. Continuar?",
        confirmLabel: "Editar mesmo assim",
        cancelLabel: "Cancelar",
      });
      if (!ok) return;
    }

    // Só o que mudou vai no payload: chave ausente = "não mexe" no backend.
    const payload = {};
    if (trocouProduto) payload.produto_id = Number(e.produtoId);
    if (mudouQtd) payload.quantidade = qtd;
    if (trocouProduto || mudouQtd || e.valorUnitario !== e.valorUnitarioOriginal) {
      payload.valor_final = valor;
    }
    if (e.vendedor !== e.vendedorOriginal && e.vendedor) payload.vendedor = e.vendedor;
    if (e.formaBase) payload.forma_pagamento = e.formaBase;
    if (e.formaBase === "credito") payload.parcelas = clampParcelas(e.parcelas);
    if (e.statusPagamento !== e.statusPagamentoOriginal) {
      payload.status_pagamento = e.statusPagamento;
    }
    const nomeFiado = e.clienteFiado.trim();
    if (nomeFiado && nomeFiado !== e.clienteFiadoOriginal) {
      payload.cliente_fiado = nomeFiado;
    }

    if (Object.keys(payload).length === 0) {
      toast.success("Nada para alterar.");
      setEdicaoMov(null);
      return;
    }

    setSalvando(true);
    try {
      await MovAPI.atualizar(e.id, payload);
      toast.success("Venda atualizada.");
      setEdicaoMov(null);
      carregar(filtro, page, soFiado);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Falha ao editar a venda.");
    } finally {
      setSalvando(false);
    }
  }

  // Exclusão de movimentação avulsa (venda/entrada). O backend reverte o
  // agregado de estoque na mesma transação e recusa o que não é venda:
  // empréstimo de garantia e baixa gerada por pedido de Som.
  //
  // O QUE A EXCLUSÃO DE ENTRADA *NÃO* FAZ: devolver o custo. Uma entrada pode
  // ter reposto custo e preços do produto, e o estorno mexe só na quantidade
  // (utils/estorno.js). O aviso sai em TODA entrada, e não só nas que mexeram
  // em preço, porque isso não é sabível: nada no banco registra a diferença nos
  // lançamentos antigos. Um aviso condicional seria pior — a ausência dele
  // passaria a significar "o custo volta", que é falso.
  async function excluirMovimentacao(r) {
    const venda = r.tipo === "SAIDA";
    const ok = await confirm({
      title: venda ? "Excluir venda" : "Excluir entrada",
      message:
        `${r.produto}${r.modelo ? ` - ${r.modelo}` : ""} · ${r.quantidade} un.\n\n` +
        `O estoque será ${venda ? "devolvido" : "reduzido"} em ${r.quantidade} un.\n\n` +
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
      await MovAPI.remover(r.id);
      toast.success(venda ? "Venda excluída." : "Entrada excluída.");
      carregar(filtro, page, soFiado);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao excluir movimentação.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
            <ClipboardList size={24} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-800 md:text-2xl">Movimentações</h1>
            <p className="text-sm text-slate-500">Histórico de entradas, saídas e pedidos de instalação</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap gap-3">
          {/* Som tem a busca dentro do RegistroSom (também acha veículo e serviço). */}
          {!isSom && (
            <div className="relative min-w-[200px] flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Buscar produto ou modelo..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
              />
            </div>
          )}

          <div className="flex gap-2">
            {[
              ...(verBaterias ? [{ key: ESTOQUE_TIPOS.BATERIAS, label: "Baterias", Icon: Battery }] : []),
              ...(verSom ? [{ key: ESTOQUE_TIPOS.SOM, label: "Som", Icon: Music }] : []),
            ].map(({ key, label, Icon }) => {
              const active = tipoEstoque === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => trocarLinha(key)}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-amber-400 text-slate-900 shadow-sm"
                      : "border border-amber-300 bg-white text-amber-600 hover:bg-amber-50"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              );
            })}

            {/* Só Baterias: Som não tem pagamento em aberto (venda de Som é pedido). */}
            {!isSom && (
              <button
                type="button"
                onClick={() => setSoFiado((v) => !v)}
                aria-pressed={soFiado}
                title="Mostrar só as vendas fiado que ainda não foram pagas"
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  soFiado
                    ? "bg-amber-400 text-slate-900 shadow-sm"
                    : "border border-amber-300 bg-white text-amber-600 hover:bg-amber-50"
                }`}
              >
                <Clock size={14} />
                Fiados em aberto
              </button>
            )}
          </div>
        </div>

        {isSom ? (
          <RegistroSom />
        ) : (
          <>
            {errorMsg && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMsg}
              </div>
            )}
            {loading && <p className="mt-3 text-sm text-slate-400">Carregando...</p>}

            {/* Table */}
            <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-slate-200 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-left text-xs font-semibold uppercase tracking-wide text-white">
                      <th className="px-3 py-2.5">Data</th>
                      <th className="px-3 py-2.5">Produto</th>
                      <th className="px-3 py-2.5">Modelo</th>
                      <th className="px-3 py-2.5">Tipo</th>
                      <th className="px-3 py-2.5">Quantidade</th>
                      <th className="px-3 py-2.5">Valor Unitário</th>
                      {hasVendedor && <th className="px-3 py-2.5">Vendedor</th>}
                      <th className="px-3 py-2.5">Forma de Pagamento</th>
                      {isAdmin && <th className="px-3 py-2.5 text-right">Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const entrada = r.tipo === "ENTRADA";
                      const rowBg = entrada ? "bg-green-50 hover:bg-green-100/70" : "bg-red-50 hover:bg-red-100/70";
                      const tdBase = "px-3 py-2.5 text-slate-700";
                      // Editável: só VENDA de Baterias que não seja empréstimo de
                      // garantia. As mesmas duas travas que o backend aplica —
                      // aqui é só para não oferecer um botão que daria 409.
                      const editavel = !isSom && !entrada && r.garantiaId == null;
                      return (
                        <React.Fragment key={`m-${r.id}`}>
                        <tr className={`border-t border-slate-100 transition-colors ${rowBg}`}>
                          <td className={`${tdBase} whitespace-nowrap`}>{fmtDataHora(r.data)}</td>
                          <td className={`${tdBase} font-semibold text-slate-800`}>{r.produto}</td>
                          <td className={tdBase}>{r.modelo}</td>
                          <td className={tdBase}>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              entrada ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                            }`}>
                              {entrada ? "ENTRADA" : "SAÍDA"}
                            </span>
                          </td>
                          <td className={tdBase}>{r.quantidade}</td>
                          <td className={tdBase}>{fmtMoney(r.valorUnitario)}</td>
                          {hasVendedor && <td className={tdBase}>{r.vendedor || "—"}</td>}
                          <td className={tdBase}>
                            {/* Fiado não tem forma de pagamento ainda — sem o selo
                                a coluna sairia vazia e pareceria dado faltando. */}
                            {r.statusPagamento === "FIADO" ? (
                              /* truncate + max-w não é enfeite: esta coluna cabe
                                 em "Crédito 10x", e um nome completo dobraria a
                                 largura dela numa tabela que já tem 9 colunas. O
                                 title mantém o nome inteiro acessível. */
                              <span
                                className="inline-flex max-w-[16rem] items-center truncate rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
                                title={r.clienteFiado
                                  ? `Fiado de ${r.clienteFiado} — ainda não recebido`
                                  : "Cliente levou e paga depois — ainda não recebido"}
                              >
                                {/* Fiado lançado antes desta coluna não tem nome:
                                    mostra só o selo, em vez de "FIADO — ". */}
                                FIADO{r.clienteFiado ? ` — ${r.clienteFiado}` : ""}
                              </span>
                            ) : (
                              r.formaPagamento || "—"
                            )}
                          </td>
                          {isAdmin && (
                            <td className={`${tdBase} text-right`}>
                              <div className="inline-flex items-center gap-1.5">
                                {editavel && (
                                  <button
                                    type="button"
                                    onClick={() => (edicaoMov?.id === r.id ? setEdicaoMov(null) : abrirEdicaoMov(r))}
                                    title="Editar venda"
                                    aria-label={`Editar venda de ${r.produto}`}
                                    aria-expanded={edicaoMov?.id === r.id}
                                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-600 transition-colors hover:bg-slate-50"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => excluirMovimentacao(r)}
                                  title="Excluir movimentação"
                                  aria-label={`Excluir movimentação de ${r.produto}`}
                                  className="inline-flex items-center rounded-lg border border-red-200 bg-white px-2 py-1.5 text-red-600 transition-colors hover:bg-red-50"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>

                        {isAdmin && edicaoMov?.id === r.id && (
                          <tr className="border-t border-slate-100 bg-slate-50">
                            <td colSpan={colCount} className="px-3 py-3">
                              <FormEdicaoVendaBaterias
                                edicao={edicaoMov}
                                setEdicao={setEdicaoMov}
                                produtos={produtosBaterias}
                                inventarioAtivo={inventarioBateriasAtivo}
                                salvando={salvando}
                                onSalvar={salvarEdicaoMov}
                              />
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}

                    {!loading && rows.length === 0 && (
                      <tr>
                        <td colSpan={colCount} className="px-4 py-16">
                          <div className="flex flex-col items-center justify-center gap-3 text-center">
                            <PackageOpen size={44} strokeWidth={1.4} className="text-slate-300" />
                            <p className="text-sm font-medium text-slate-500">Nenhuma movimentação encontrada.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Paginação (movimentações simples) */}
            {pages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  {total} movimentaç{total === 1 ? "ão" : "ões"} · página {page} de {pages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft size={16} /> Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page >= pages || loading}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Próxima <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ===== Edição de VENDA de Baterias =====
 *
 * Achatado de propósito: uma venda de Baterias é UMA linha, sem itens e sem
 * total derivado. Não há o bloco de serviços nem o de produtos do pedido de
 * Som — só os campos da própria movimentação. */
function FormEdicaoVendaBaterias({ edicao, setEdicao, produtos, inventarioAtivo, salvando, onSalvar }) {
  const set = (patch) => setEdicao({ ...edicao, ...patch });

  const catalogo = produtos.find((p) => String(p.id) === String(edicao.produtoId));
  const emEstoque = catalogo ? saldoDoProduto(catalogo) : null;
  // As unidades DESTA venda voltam ao estoque antes da nova baixa — sem mostrar
  // isso, um produto zerado parece impedir qualquer aumento, quando na verdade
  // dá para chegar de volta ao que já estava vendido aqui.
  const mesmoProduto = String(edicao.produtoId) === String(edicao.produtoIdOriginal);
  const efetivo = emEstoque == null ? null : emEstoque + (mesmoProduto ? edicao.quantidadeOriginal : 0);
  const excede = efetivo != null && Number(edicao.quantidade) > efetivo;

  const credito = edicao.formaBase === "credito";
  const trocouVendedor = edicao.vendedor !== edicao.vendedorOriginal;

  const inputBase = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-100 p-3">
      <p className="text-sm font-semibold text-slate-700">Editar venda</p>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.6fr)_5rem_7rem]">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Produto</label>
          <ProdutoSearchSelect
            produtos={produtos}
            value={edicao.produtoId}
            onChange={(p) => set({ produtoId: p ? String(p.id) : "" })}
            placeholder={edicao.rotuloProduto || "Buscar produto…"}
            showAllOnEmpty={false}
            getLabel={(p) => [p?.produto, p?.modelo].filter(Boolean).join(" - ")}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Qtd.</label>
          <input
            type="number" min="1" step="1"
            value={edicao.quantidade}
            onChange={(ev) => set({ quantidade: ev.target.value === "" ? "" : Number(ev.target.value) })}
            className={`${inputBase} ${excede ? "border-red-400" : ""}`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Valor unit.</label>
          <input
            type="number" min="0" step="0.01"
            value={edicao.valorUnitario}
            onChange={(ev) => set({ valorUnitario: ev.target.value })}
            className={inputBase}
          />
        </div>
      </div>

      {efetivo != null && (
        <p className={`mt-1 text-xs ${excede ? "text-red-600" : "text-slate-400"}`}>
          {mesmoProduto
            ? `Disponível: ${efetivo} un. (${emEstoque} em estoque + ${edicao.quantidadeOriginal} desta venda, que voltam)`
            : `Disponível: ${efetivo} un.`}
        </p>
      )}

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Vendedor</label>
          <select
            value={edicao.vendedor}
            onChange={(ev) => set({ vendedor: ev.target.value })}
            className={inputBase}
          >
            {/* Sem opção vazia quando já há vendedor: tirar o vendedor de uma
                venda a removeria da comissão, e isso não é edição, é outra
                coisa. Venda antiga sem vendedor mantém o vazio até escolherem. */}
            {!edicao.vendedorOriginal && <option value="">—</option>}
            {VENDEDORES_BATERIA.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Forma</label>
          <select
            value={edicao.formaBase}
            onChange={(ev) => set({ formaBase: ev.target.value })}
            className={inputBase}
          >
            <option value="">—</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="pix">PIX</option>
            <option value="debito">Débito</option>
            <option value="credito">Crédito</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Parcelas</label>
          <select
            value={credito ? edicao.parcelas : ""}
            onChange={(ev) => set({ parcelas: Number(ev.target.value) })}
            disabled={!credito}
            className={`${inputBase} disabled:bg-slate-100 disabled:text-slate-400`}
          >
            {credito
              ? Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}x</option>
              ))
              : <option value="">—</option>}
          </select>
        </div>
      </div>

      {/* Pagamento. Só aparece quando a venda É ou FOI fiado: numa venda paga
          normal não há nada a decidir, e um controle a mais só faria ruído. */}
      {(edicao.statusPagamentoOriginal === "FIADO" || edicao.statusPagamento === "FIADO") && (
        <div className="mt-2 rounded-lg bg-amber-50 p-2 ring-1 ring-amber-200">
          {/* Nome de quem deve: editável para corrigir depois ("João" que era
              "João da esquina") e para preencher fiado antigo, lançado antes
              desta coluna existir. */}
          <label className="mb-2 block text-xs font-medium text-amber-900">
            Cliente
            <input
              type="text"
              value={edicao.clienteFiado}
              onChange={(ev) => set({ clienteFiado: ev.target.value })}
              maxLength={150}
              placeholder="Nome de quem está devendo"
              className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={edicao.statusPagamento === "PAGO"}
              onChange={(ev) => set({ statusPagamento: ev.target.checked ? "PAGO" : "FIADO" })}
              className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-400"
            />
            <span className="font-medium">Cliente pagou — dar baixa</span>
          </label>
          <p className="mt-1 text-xs text-amber-700">
            {edicao.statusPagamento === "PAGO"
              ? (edicao.formaBase
                ? "A data do pagamento é registrada agora. Sai de A Receber."
                : "Selecione a Forma acima: é ela que define a taxa da maquininha.")
              : "Em aberto — a venda já conta no faturamento e aparece em A Receber."}
          </p>
        </div>
      )}

      {inventarioAtivo && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          Há uma conferência de estoque de Baterias em andamento. Mudar produto ou quantidade agora
          gera divergência na contagem.
        </p>
      )}

      {edicao.periodoFechado && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          {trocouVendedor
            ? `A comissão desta venda já foi paga a ${edicao.vendedorOriginal || "o vendedor da época"} e
               continuará paga a ele — passar a venda para ${edicao.vendedor || "outro vendedor"} não
               recalcula a quinzena fechada.`
            : `A quinzena desta venda já foi fechada e a comissão de
               ${edicao.vendedorOriginal || "o vendedor"} já foi paga. Editar não muda o valor pago.`}
        </p>
      )}

      <p className="mt-2 text-xs text-slate-400">
        A data da venda não muda — é ela que define a quinzena da comissão e o período do dashboard.
      </p>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEdicao(null)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando}
          className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

