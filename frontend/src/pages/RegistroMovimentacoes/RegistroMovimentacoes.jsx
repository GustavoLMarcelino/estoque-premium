import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ClipboardList, Search, Battery, Music, PackageOpen, ChevronLeft, ChevronRight,
  ChevronDown, Wrench, Trash2, Package, Pencil, CreditCard, Clock,
} from "lucide-react";
import { MovAPI } from "../../services/movimentacoes";
import { MovSomAPI } from "../../services/movimentacoesSom";
import { PedidoSomAPI } from "../../services/pedidoSom";
import { EstoqueSomAPI } from "../../services/estoqueSom";
import { EstoqueAPI } from "../../services/estoque";
import { InventarioAPI } from "../../services/inventario";
import ProdutoSearchSelect from "../../components/ProdutoSearchSelect/ProdutoSearchSelect";
import { ESTOQUE_TIPOS } from "../../services/estoqueTipos";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { getRole, temLinha } from "../../services/auth";
import { usaPrecoParcelado, rotuloFormaSom, parcelasDoRotulo, clampParcelas } from "../../utils/precos";
import { sugerirPercentual } from "../../utils/comissaoItem";

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
  const isAdmin = getRole() === "admin"; // DELETE de pedido é restrito a admin no backend
  // Escopo de linha: só as linhas que o usuário opera aparecem no toggle.
  const verBaterias = temLinha("baterias");
  const verSom = temLinha("som");

  const [rows, setRows] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [expandido, setExpandido] = useState(() => new Set());
  const [filtro, setFiltro] = useState("");
  const [tipoEstoque, setTipoEstoque] = useState(
    verBaterias ? ESTOQUE_TIPOS.BATERIAS : ESTOQUE_TIPOS.SOM,
  );
  // Filtro "Fiados em aberto". Vai como parâmetro para o backend — a lista
  // pagina de 20 em 20, e filtrar o que já veio esconderia os fiados das outras
  // páginas enquanto o rodapé seguisse contando a lista inteira.
  const [soFiado, setSoFiado] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  // Edição de pedido (Fase C/C2): null = ninguém editando.
  const [edicao, setEdicao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  // Catálogo de Som para o combobox de produto da edição (Fase D).
  const [produtosSom, setProdutosSom] = useState([]);
  const [inventarioAtivo, setInventarioAtivo] = useState(false);
  // Edição de VENDA de Baterias: null = ninguém editando. Estado próprio, e não
  // o `edicao` do pedido — são formulários diferentes e podem coexistir na tela.
  const [edicaoMov, setEdicaoMov] = useState(null);
  const [produtosBaterias, setProdutosBaterias] = useState([]);
  const [inventarioBateriasAtivo, setInventarioBateriasAtivo] = useState(false);

  const isSom = tipoEstoque === ESTOQUE_TIPOS.SOM;

  // `fiado` é parâmetro, e não leitura do estado: este useCallback tem deps []
  // de propósito (identidade estável), então ler soFiado aqui dentro pegaria o
  // valor congelado da primeira renderização. Todo call site tem que passá-lo —
  // esquecer um faz o filtro se desligar sozinho depois de salvar.
  const carregar = useCallback(async (q, pg, linha, fiado) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const service = linha === ESTOQUE_TIPOS.SOM ? MovSomAPI : MovAPI;
      const res = await service.listarPagina({
        q,
        page: pg,
        pageSize: PAGE_SIZE,
        // Só Baterias tem a coluna. Em Som o param seria ignorado pela rota, e
        // o filtro ficaria ligado sem filtrar nada — por isso o botão some lá.
        status_pagamento: linha === ESTOQUE_TIPOS.SOM || !fiado ? undefined : "FIADO",
      });
      setRows((res?.data || []).map((r) => mapMovToUi(r)));
      setPages(res?.pages || 1);
      setTotal(res?.total || 0);

      // Pedidos de instalação: só na aba Som e apenas na primeira página, onde
      // são mesclados por data com as movimentações. Vêm TODOS — nesta mistura
      // não existe "página 2 de pedidos", então um teto faria os mais antigos
      // sumirem da tela sem aviso.
      if (linha === ESTOQUE_TIPOS.SOM && pg === 1) {
        setPedidos(await PedidoSomAPI.listarTodos());
      } else {
        setPedidos([]);
      }
    } catch (e) {
      console.error("GET movimentações ERRO:", e);
      setErrorMsg(e?.response?.data?.message || e?.message || "Falha ao carregar movimentações");
      setRows([]);
      setPedidos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // soFiado entra aqui: ligar o filtro encolhe a lista, e ficar na página 3 de
  // uma lista que passou a ter 1 página mostraria uma tabela vazia.
  useEffect(() => { setPage(1); setExpandido(new Set()); }, [filtro, tipoEstoque, soFiado]);

  // Só admin edita pedido, e só a aba Som tem pedido — fora disso não busca.
  useEffect(() => {
    if (!isAdmin || !isSom) return;
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
  }, [isAdmin, isSom]);

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
    const t = setTimeout(() => carregar(filtro, page, tipoEstoque, soFiado), 300);
    return () => clearTimeout(t);
  }, [filtro, page, tipoEstoque, soFiado, carregar]);

  // Linha de movimentação simples nunca tem vendedor na aba Som.
  const hasVendedor = useMemo(() => rows.some((r) => r.vendedor), [rows]);
  // +1 pela coluna de ações, que só existe para admin (quem pode excluir).
  const colCount = (hasVendedor ? 8 : 7) + (isAdmin ? 1 : 0);

  // Mescla movimentações simples + pedidos (Som, página 1), por data desc.
  const linhasTabela = useMemo(() => {
    const movEntries = rows.map((r) => ({
      kind: "mov", key: `m-${r.id}`, sort: new Date(r.data).getTime() || 0, mov: r,
    }));
    if (!isSom) return movEntries;
    const pedEntries = pedidos.map((p) => ({
      kind: "pedido", key: `p-${p.id}`, sort: new Date(p.created_at).getTime() || 0, pedido: p,
    }));
    return [...movEntries, ...pedEntries].sort((a, b) => b.sort - a.sort);
  }, [rows, pedidos, isSom]);

  function toggleExpandir(id) {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ----- edição do pedido (Fase C: cabeçalho · Fase C2: serviços) -----
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
      // Produtos (Fase D): editáveis. quantidadeOriginal fica guardada para o
      // saldo efetivo — as unidades deste item voltam ao estoque antes da nova
      // baixa, então o "Estoque atual" do catálogo não é o limite real.
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
        // produtos foram reescritos (Fase D), os ids antigos deixam de existir.
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
      carregar(filtro, page, tipoEstoque, soFiado);
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
      carregar(filtro, page, tipoEstoque, soFiado);
    } catch (e) {
      toast.error(e?.response?.data?.message || "Falha ao excluir pedido.");
    }
  }

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
      carregar(filtro, page, tipoEstoque, soFiado);
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
      const service = isSom ? MovSomAPI : MovAPI;
      await service.remover(r.id);
      toast.success(venda ? "Venda excluída." : "Entrada excluída.");
      carregar(filtro, page, tipoEstoque, soFiado);
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
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Buscar produto ou modelo..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            />
          </div>

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
                  onClick={() => setTipoEstoque(key)}
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

            {/* Só Baterias: /movimentacoes-som não tem status_pagamento, e o
                botão ligado sem filtrar nada seria pior que não existir. */}
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
                {linhasTabela.map((entry) => {
                  if (entry.kind === "mov") {
                    const r = entry.mov;
                    const entrada = r.tipo === "ENTRADA";
                    const rowBg = entrada ? "bg-green-50 hover:bg-green-100/70" : "bg-red-50 hover:bg-red-100/70";
                    const tdBase = "px-3 py-2.5 text-slate-700";
                    // Editável: só VENDA de Baterias que não seja empréstimo de
                    // garantia. As mesmas duas travas que o backend aplica —
                    // aqui é só para não oferecer um botão que daria 409.
                    const editavel = !isSom && !entrada && r.garantiaId == null;
                    return (
                      <React.Fragment key={entry.key}>
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
                  }

                  // ----- linha de PEDIDO DE INSTALAÇÃO -----
                  const p = entry.pedido;
                  const aberto = expandido.has(p.id);
                  const tdBase = "px-3 py-2.5 text-slate-700";
                  return (
                    <React.Fragment key={entry.key}>
                      <tr
                        onClick={() => toggleExpandir(p.id)}
                        className="cursor-pointer border-t border-slate-100 bg-purple-50 transition-colors hover:bg-purple-100/70"
                      >
                        <td className={`${tdBase} whitespace-nowrap`}>
                          <span className="inline-flex items-center gap-1">
                            <ChevronDown
                              size={14}
                              className={`text-purple-500 transition-transform ${aberto ? "" : "-rotate-90"}`}
                            />
                            {fmtDataHora(p.created_at)}
                          </span>
                        </td>
                        <td className={`${tdBase} font-semibold text-slate-800`}>
                          Pedido de instalação{p.veiculo ? ` · ${p.veiculo}` : ""}
                        </td>
                        <td className={tdBase}>{p.itens?.length ?? 0} item(ns)</td>
                        <td className={tdBase}>
                          <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700">
                            INSTALAÇÃO
                          </span>
                        </td>
                        <td className={tdBase}>{p.itens?.length ?? 0}</td>
                        <td className={`${tdBase} font-bold text-slate-800`}>{fmtMoney(p.valor_total)}</td>
                        {hasVendedor && <td className={tdBase}>—</td>}
                        <td className={tdBase}>{p.forma_pagamento || "—"}</td>
                        {/* Pedido se exclui pelo botão dentro da linha expandida
                            (excluir o pedido inteiro é mais destrutivo que uma
                            movimentação avulsa e merece o detalhe à vista). */}
                        {isAdmin && <td className={tdBase} />}
                      </tr>

                      {aberto && (
                        <tr className="bg-purple-50/40">
                          <td colSpan={colCount} className="px-4 py-3">
                            <div className="rounded-lg border border-purple-100 bg-white p-3">
                              <ul className="divide-y divide-slate-100">
                                {(p.itens || []).map((it) => {
                                  // Serviço não tem preço de peça: valor_unit/
                                  // valor_total são 0 e o dinheiro dele vive em
                                  // mao_obra_*. Mostrar valor_unit fazia toda
                                  // instalação aparecer como "1 × R$ 0,00".
                                  const servico = it.tipo === "MAO_OBRA";
                                  // Mão de obra é dado de admin (o backend já
                                  // omite para os demais).
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
                                          {oculto ? `${it.quantidade} un.` : `${it.quantidade} × ${fmtMoney(unit)}`}
                                          {servico && !oculto && " (mão de obra)"}
                                        </span>
                                      </span>
                                      <span className="font-semibold text-slate-700">
                                        {oculto ? "—" : fmtMoney(total)}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>

                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
                                <div className="text-slate-600">
                                  {/* Mão de obra e comissão são dados de admin. O backend já
                                      omite esses campos para não-admin (sanitizePedidoComissao);
                                      o guard isAdmin é defesa extra no front. */}
                                  {isAdmin && Number(p.valor_mao_obra) > 0 && (
                                    <span className="mr-4">
                                      Mão de obra: <strong>{fmtMoney(p.valor_mao_obra)}</strong>
                                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                        Joel {fmtMoney(p.comissao_joel)}
                                      </span>
                                    </span>
                                  )}
                                  <span>Total: <strong className="text-slate-800">{fmtMoney(p.valor_total)}</strong></span>
                                </div>
                                {isAdmin && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); abrirEdicao(p); }}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                                    >
                                      <Pencil size={14} /> Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); excluirPedido(p); }}
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
                                  onSalvar={salvarEdicao}
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {!loading && linhasTabela.length === 0 && (
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
      </div>
    </div>
  );
}

/* ===== edição de pedido (Fase C) =====
 * Só o cabeçalho que não cascateia: veículo, forma de pagamento e parcelas.
 * SEM itens, SEM produto, SEM valor — mexer neles envolve estoque e mão de obra,
 * e fica para as fases seguintes. O select espelha o do PedidoSomForm (mesmas 4
 * opções, mesmo clamp de 1–10); o rótulo gravado sai de rotuloFormaSom, a mesma
 * regra das duas telas. */
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

/** Patch do nome do serviço: re-sugere a % SÓ enquanto o usuário não a tocou.
 *  Item que já existe chega com pctTocado=true (tem % gravada), então renomear
 *  um serviço antigo nunca mexe na comissão dele. */
function nomeServicoPatch(s, descricao) {
  if (s.pctTocado) return { descricao };
  return { descricao, percentual_comissao: String(sugerirPercentual(descricao)) };
}

function FormEdicaoPedido({ edicao, setEdicao, produtosSom, inventarioAtivo, salvando, onSalvar }) {
  const credito = edicao.formaBase === "Crédito";
  const set = (patch) => setEdicao((prev) => ({ ...prev, ...patch }));

  // Qualquer mexida nos serviços/produtos marca o form como "sujo": só então o
  // salvamento manda itens e dispara a reagregação no servidor.
  const setServicos = (servicos) => set({ servicos, servicosDirty: true });
  const patchServico = (i, patch) =>
    setServicos(edicao.servicos.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  // produtosDirty = vai reescrever itens e ESTOQUE. maoObraProdutosDirty mexe só
  // no valor legado, sem tocar em estoque — dois caminhos, duas flags.
  const setProdutos = (produtos) => set({ produtos, produtosDirty: true });
  const patchProduto = (i, patch) =>
    setProdutos(edicao.produtos.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const patchMaoObraProduto = (i, patch) =>
    set({
      produtos: edicao.produtos.map((p, j) => (j === i ? { ...p, ...patch } : p)),
      maoObraProdutosDirty: true,
    });

  const estoqueDe = (p) => Number(
    p?.em_estoque ?? (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0)),
  ) || 0;
  // Preço de item NOVO: mesma base do PedidoSomForm (crédito usa o parcelado).
  const precoDoCatalogo = (p) => (credito
    ? Number(p?.valor_parcelado ?? p?.valor_venda ?? 0)
    : Number(p?.valor_vista ?? p?.valor_venda ?? 0)) || 0;

  // Prévia: soma da mão de obra e a comissão que ela gera, item × a SUA %.
  // Sem separar por categoria — ela deixou de existir em 17/08/2026.
  const previa = edicao.servicos.reduce((acc, s) => {
    const valor = (Number(s.mao_obra_unit) || 0) * (Number(s.quantidade) || 0);
    acc.total += valor;
    acc.comissao += (valor * (Number(s.percentual_comissao) || 0)) / 100;
    return acc;
  }, { total: 0, comissao: 0 });

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
    >
      <p className="text-sm font-semibold text-slate-700">Editar pedido</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Veículo</span>
          <input
            type="text"
            value={edicao.veiculo}
            onChange={(e) => set({ veiculo: e.target.value })}
            placeholder="Ex.: Gol 2015"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Forma de pagamento</span>
          <div className="relative">
            <CreditCard size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={edicao.formaBase}
              onChange={(e) => set({ formaBase: e.target.value })}
              className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            >
              <option value="">Selecione...</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Débito">Débito</option>
              <option value="Crédito">Crédito</option>
              <option value="PIX">PIX</option>
            </select>
          </div>
        </label>
      </div>

      {credito && (
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor={`parcelas-edicao-${edicao.id}`} className="text-sm text-slate-600">Parcelas</label>
          <input
            id={`parcelas-edicao-${edicao.id}`}
            type="number" min="1" max="10" value={edicao.parcelas}
            onChange={(e) => set({ parcelas: e.target.value })}
            onBlur={() => set({ parcelas: clampParcelas(edicao.parcelas) })}
            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
          <span className="text-sm font-medium text-slate-500">
            {rotuloFormaSom("Crédito", clampParcelas(edicao.parcelas))}
          </span>
        </div>
      )}

      {/* ── Serviços e mão de obra (Fase C2) ── */}
      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700">Serviços e mão de obra</span>
          <button
            type="button"
            onClick={() => setServicos([...edicao.servicos, {
              key: `n${Date.now()}`, descricao: "", quantidade: 1, mao_obra_unit: "",
              percentual_comissao: "", pctTocado: false,
            }])}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-white"
          >
            + Serviço
          </button>
        </div>

        {edicao.servicos.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">Nenhum serviço — o pedido fica só com os produtos.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {edicao.servicos.map((s, i) => (
              <li key={s.key} className="rounded-lg border border-slate-200 bg-white p-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_5.5rem_auto]">
                  <input
                    type="text" placeholder="Nome do serviço"
                    value={s.descricao}
                    onChange={(e) => patchServico(i, nomeServicoPatch(s, e.target.value))}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400"
                  />
                  <input
                    type="number" min="1" aria-label="Quantidade"
                    value={s.quantidade}
                    onChange={(e) => patchServico(i, { quantidade: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-amber-400"
                  />
                  <input
                    type="number" min="0" step="0.01" placeholder="Mão de obra"
                    value={s.mao_obra_unit}
                    onChange={(e) => patchServico(i, { mao_obra_unit: e.target.value })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400"
                  />
                  <input
                    type="number" min="0" max="100" step="0.01" placeholder="% Joel"
                    aria-label="Percentual de comissão"
                    value={s.percentual_comissao}
                    onChange={(e) => patchServico(i, { percentual_comissao: e.target.value, pctTocado: true })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => setServicos(edicao.servicos.filter((_, j) => j !== i))}
                    aria-label="Remover serviço"
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Total do item: {fmtMoney((Number(s.mao_obra_unit) || 0) * (Number(s.quantidade) || 0))}
                  {` · Joel ${Number(s.percentual_comissao) || 0}%`}
                </p>
              </li>
            ))}
          </ul>
        )}

        {/* Prévia — só as SOMAS. O número final vem da resposta do servidor:
            duplicar a fórmula da comissão aqui seria criar uma segunda verdade. */}
        <div className="mt-2 rounded-lg bg-white p-2 text-xs text-slate-600">
          <div>Mão de obra dos serviços: <strong>{fmtMoney(previa.total)}</strong></div>
          <div className="text-slate-400">Comissão do Joel (prévia): {fmtMoney(previa.comissao)}</div>
          <div className="mt-1 text-slate-400">
            A comissão do Joel e o total do pedido são recalculados no servidor ao salvar.
          </div>
        </div>
      </div>

      {/* ── Produtos (Fase D) — o único bloco que mexe em ESTOQUE ── */}
      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700">Produtos</span>
          <button
            type="button"
            onClick={() => setProdutos([...edicao.produtos, {
              key: `np${Date.now()}`, item_id: null, produto_id: "", descricao: "",
              quantidade: 1, quantidadeOriginal: 0, valor_unit: "", mao_obra_unit: "",
            }])}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-white"
          >
            + Produto
          </button>
        </div>

        {edicao.produtos.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">Nenhum produto — o pedido fica só com os serviços.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {edicao.produtos.map((prod, i) => {
              const cat = produtosSom.find((x) => String(x.id) === String(prod.produto_id));
              const emEstoque = cat ? estoqueDe(cat) : null;
              // As unidades DESTE item voltam ao estoque antes da nova baixa —
              // sem mostrar isso, um produto zerado parece impedir qualquer
              // aumento, quando na verdade dá para chegar ao que já estava aqui.
              const efetivo = emEstoque == null ? null : emEstoque + prod.quantidadeOriginal;
              return (
                <li key={prod.key} className="rounded-lg border border-slate-200 bg-white p-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.6fr)_4.5rem_7rem_auto]">
                    <ProdutoSearchSelect
                      produtos={produtosSom}
                      value={prod.produto_id}
                      onChange={(p) => patchProduto(i, {
                        produto_id: p ? String(p.id) : "",
                        descricao: [p?.produto, p?.modelo].filter(Boolean).join(" - "),
                        // Produto novo entra com o preço do catálogo; item que já
                        // existia mantém o valor gravado (não reprecifica).
                        ...(prod.item_id ? {} : { valor_unit: String(precoDoCatalogo(p)) }),
                      })}
                      placeholder={prod.descricao || "Buscar produto…"}
                      showAllOnEmpty={false}
                      maxResults={8}
                      renderOption={(p) => (
                        <>
                          <span className="text-slate-700">{[p.produto, p.modelo].filter(Boolean).join(" — ")}</span>
                          <span className="text-xs text-slate-400">Estoque: {estoqueDe(p)}</span>
                        </>
                      )}
                    />
                    <input
                      type="number" min="1" aria-label="Quantidade"
                      value={prod.quantidade}
                      onChange={(e) => patchProduto(i, { quantidade: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-amber-400"
                    />
                    <input
                      type="number" min="0" step="0.01" placeholder="Valor un."
                      value={prod.valor_unit}
                      onChange={(e) => patchProduto(i, { valor_unit: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => setProdutos(edicao.produtos.filter((_, j) => j !== i))}
                      aria-label="Remover produto"
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Total do item: {fmtMoney((Number(prod.valor_unit) || 0) * (Number(prod.quantidade) || 0))}
                    {efetivo != null && (
                      <>
                        {" · "}pode ir até <strong className="text-slate-500">{efetivo}</strong> un.
                        {prod.quantidadeOriginal > 0 && ` (estoque ${emEstoque} + ${prod.quantidadeOriginal} deste item, que voltam antes)`}
                      </>
                    )}
                  </p>
                  {prod.item_id && prod.mao_obra_unit !== "" && !edicao.produtosDirty && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      Mão de obra (legado)
                      <input
                        type="number" min="0" step="0.01"
                        value={prod.mao_obra_unit}
                        onChange={(e) => patchMaoObraProduto(i, { mao_obra_unit: e.target.value })}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800 outline-none focus:border-amber-400"
                      />
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {edicao.produtosDirty && (
          <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            Mexer nos produtos ALTERA O ESTOQUE: as unidades atuais deste pedido voltam e as novas são baixadas.
          </p>
        )}
      </div>

      {inventarioAtivo && edicao.produtosDirty && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Há um inventário de Som em andamento; esta alteração pode gerar divergência na contagem.
        </p>
      )}

      {edicao.periodoFechado && (edicao.servicosDirty || edicao.maoObraProdutosDirty || edicao.produtosDirty) && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Este pedido é de uma quinzena já apurada. A alteração NÃO muda a comissão que já foi paga —
          o pedido passará a divergir daquela apuração.
        </p>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Editar itens muda o total do pedido, a receita e a taxa no dashboard, e a mão de obra muda também
        a comissão. Preços não são recalculados sozinhos: o valor da época é mantido, e só produto novo
        entra com o preço do catálogo. A forma de pagamento registra como o cliente pagou, sem re-precificar.
        A data do pedido não é editável.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => setEdicao(null)}
          disabled={salvando}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-white disabled:opacity-70"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
