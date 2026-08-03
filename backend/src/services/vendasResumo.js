// Agregação de vendas para o dashboard — FONTE ÚNICA das duas linhas.
//
// POR QUE EXISTE: a conta de Baterias vivia inline em /movimentacoes/resumo.
// Quando Som passou a precisar do mesmo resumo, duplicar o laço garantiria
// divergência silenciosa entre as linhas em poucos meses. Aqui existe UMA
// definição de "o que é receita, custo, taxa e lucro" — /movimentacoes/resumo
// e /vendas-resumo consomem a mesma.
//
// MODELO (idêntico nas duas linhas, decisões travadas):
//   lucro = receita − custo − taxa. COMISSÃO FICA DE FORA (nem Ismael nas
//     baterias, nem Joel no som) — comissão é apuração própria, em /comissoes.
//   custo = custo ATUAL do produto (estoque.custo / estoque_som.custo), não
//     snapshot por venda. As duas linhas herdam a mesma limitação: mudar o
//     custo de um produto reescreve o lucro histórico dele.
//   taxa = calculada POR VENDA e já arredondada (taxaSobreReceita trunca ao
//     centavo cada componente). Somar receitas e taxar o total daria centavos
//     diferentes — por isso a taxa nunca é calculada sobre agregado.
//
// De onde vem a receita de cada linha:
//   Baterias — movimentacoes SAIDA (valor_final é UNITÁRIO: × quantidade).
//   Som      — pedido_som.valor_total (o pedido é a venda; as movimentacoes_som
//              que ele gera são baixa de estoque, NÃO uma segunda receita).
import { taxaSobreReceita, round2 } from '../utils/taxas.js';
import { normalizarForma, creditoSemParcelas } from '../utils/formaPagamento.js';

/** Decimal do Prisma (MySQL) ou Float (SQLite dev) → number. */
const num = (v) => (v == null ? 0 : Number(String(v)) || 0);

/** Chave YYYY-MM-DD da série. MESMO método nas duas linhas (UTC), para que um
 *  pedido de Som e uma venda de Baterias do mesmo instante caiam no mesmo dia.
 *  Nota: é o dia em UTC, não em horário local — comportamento herdado do
 *  /movimentacoes/resumo original; mudar isso deslocaria a série de Baterias. */
const diaDe = (data) => data.toISOString().slice(0, 10);

/** Acumulador zerado — o formato comum das duas linhas. */
const accVazio = () => ({
  vendasBrutas: 0,
  custoVendido: 0,
  qtdVendas: 0,
  taxas: 0,
  semFormaQtd: 0,
  semFormaReceita: 0,
  porDia: new Map(),
});

/** Soma dois acumuladores (o bloco "Ambos"). Linha fora do escopo entra como
 *  null e simplesmente não soma. O total sai dos acumuladores CRUS, não dos
 *  blocos já arredondados — senão lucroBruto do total poderia divergir um
 *  centavo de (vendasBrutas − custoVendido) do próprio total. */
export function somarAcc(...accs) {
  const total = accVazio();
  for (const a of accs) {
    if (!a) continue;
    total.vendasBrutas += a.vendasBrutas;
    total.custoVendido += a.custoVendido;
    total.qtdVendas += a.qtdVendas;
    total.taxas += a.taxas;
    total.semFormaQtd += a.semFormaQtd;
    total.semFormaReceita += a.semFormaReceita;
    for (const [dia, receita] of a.porDia) {
      total.porDia.set(dia, (total.porDia.get(dia) || 0) + receita);
    }
  }
  return total;
}

/** Acumulador → payload. custo/lucro só para quem pode ver custo (mesmo gate
 *  do sanitizeCusto do estoque; o líquido deriva do bruto, mesmo critério).
 *  `extras` carrega os campos que só uma linha tem (Som). */
export function formatarBloco(acc, verCusto, extras = null) {
  return {
    vendasBrutas: round2(acc.vendasBrutas),
    qtdVendas: acc.qtdVendas,
    taxas: round2(acc.taxas),
    vendasSemForma: { qtd: acc.semFormaQtd, receita: round2(acc.semFormaReceita) },
    seriePorDia: [...acc.porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, receita]) => ({ dia, receita: round2(receita) })),
    ...(extras || {}),
    ...(verCusto
      ? {
          custoVendido: round2(acc.custoVendido),
          lucroBruto: round2(acc.vendasBrutas - acc.custoVendido),
          lucroLiquido: round2(acc.vendasBrutas - acc.custoVendido - acc.taxas),
        }
      : {}),
  };
}

/** BATERIAS: uma venda = uma movimentação de SAIDA.
 *
 *  garantia_id só é preenchido nas movimentações de EMPRÉSTIMO de garantia (a
 *  SAÍDA da ida e a ENTRADA da devolução). Empréstimo não é venda nem perda — é
 *  saída temporária — então fica FORA de faturamento/custo/lucro. Sem isto, a
 *  SAÍDA do empréstimo (valor_final 0, custo > 0) entrava como prejuízo e nunca
 *  era compensada. */
export async function agregarBaterias(client, cfg) {
  const rows = await client.movimentacoes.findMany({
    where: { tipo: 'SAIDA', garantia_id: null },
    select: {
      id: true,
      quantidade: true,
      valor_final: true,
      forma_pagamento: true,
      parcelas: true,
      data_movimentacao: true,
      estoque: { select: { custo: true } },
    },
  });

  const acc = accVazio();
  for (const mv of rows) {
    const qtd = Number(mv.quantidade || 0);
    const receita = num(mv.valor_final) * qtd;
    acc.vendasBrutas += receita;
    acc.custoVendido += num(mv.estoque?.custo) * qtd;
    acc.qtdVendas += qtd;

    // forma_pagamento de Baterias já é a chave (z.enum no schema), então a
    // normalização é no-op aqui — mas passa pelo MESMO caminho de Som para que
    // as duas linhas tratem "sem forma" e "crédito sem parcelas" igual.
    const forma = normalizarForma(mv.forma_pagamento);
    if (forma == null || creditoSemParcelas(forma, mv.parcelas)) {
      acc.semFormaQtd += 1;
      acc.semFormaReceita += receita;
    } else {
      acc.taxas += taxaSobreReceita(receita, forma, mv.parcelas, cfg).valor;
    }

    if (mv.data_movimentacao) {
      const dia = diaDe(mv.data_movimentacao);
      acc.porDia.set(dia, (acc.porDia.get(dia) || 0) + receita);
    }
  }
  return acc;
}

/** SOM: uma venda = um pedido de instalação.
 *
 *  Receita é o valor_total CHEIO (peças + mão de obra) — é o que passa na
 *  maquininha, então é também a base da taxa. Custo vem SÓ dos itens de
 *  produto: mão de obra não tem custo de produto, e por isso um pedido só de
 *  serviço aparece com margem ~100%. Para a tela não ler isso como lucro
 *  extraordinário, o bloco separa receitaProdutos de receitaMaoObra.
 *
 *  pedido_som_item.produto_id NÃO tem relação Prisma com estoque_som (só um
 *  índice), então o custo sai de um lookup em dois passos + Map — mesmo padrão
 *  de garantias.routes.js e estoqueResumo.routes.js. */
export async function agregarSom(client, cfg) {
  const [pedidos, manuais] = await Promise.all([
    client.pedido_som.findMany({
      select: {
        id: true,
        valor_total: true,
        valor_mao_obra: true,
        forma_pagamento: true,
        parcelas: true,
        created_at: true,
        itens: { select: { tipo: true, produto_id: true, quantidade: true } },
      },
    }),
    // Saídas de Som SEM pedido (modal de movimentação do Estoque): motivo fica
    // null, enquanto as do pedido gravam 'Pedido Som #<id>'. Não têm forma de
    // pagamento nem receita registrada, então ficam FORA do faturamento — mas
    // são estoque saindo, então são sinalizadas à parte. NUNCA somar isto a
    // vendasBrutas: a receita de Som sai só de pedido_som (a movimentação do
    // pedido é baixa de estoque, contá-la seria dobrar o faturamento).
    client.movimentacoes_som.aggregate({
      where: { tipo: 'SAIDA', motivo: null },
      _count: { _all: true },
      _sum: { quantidade: true },
    }),
  ]);

  // Custo atual dos produtos vendidos, num lookup só.
  const produtoIds = [
    ...new Set(
      pedidos.flatMap((p) =>
        p.itens.filter((i) => i.tipo === 'PRODUTO' && i.produto_id != null).map((i) => i.produto_id),
      ),
    ),
  ];
  const produtos = produtoIds.length
    ? await client.estoque_som.findMany({
        where: { id: { in: produtoIds } },
        select: { id: true, custo: true },
      })
    : [];
  const custoPorProduto = new Map(produtos.map((p) => [p.id, num(p.custo)]));

  const acc = accVazio();
  let qtdPedidos = 0;
  let receitaProdutos = 0;
  let receitaMaoObra = 0;

  for (const p of pedidos) {
    const receita = num(p.valor_total);
    const maoObra = num(p.valor_mao_obra); // null quando o pedido não tem serviço
    acc.vendasBrutas += receita;
    receitaMaoObra += maoObra;
    receitaProdutos += receita - maoObra;
    qtdPedidos += 1;

    for (const it of p.itens) {
      if (it.tipo !== 'PRODUTO') continue;
      const qtd = Number(it.quantidade || 0);
      acc.qtdVendas += qtd;
      // Produto ausente (apagado) → custo 0. Na prática a FK de
      // movimentacoes_som impede apagar produto com pedido, mas o fallback
      // evita que um órfão vire lucro inflado sem ninguém perceber.
      acc.custoVendido += qtd * (custoPorProduto.get(it.produto_id) ?? 0);
    }

    const forma = normalizarForma(p.forma_pagamento);
    if (forma == null || creditoSemParcelas(forma, p.parcelas)) {
      acc.semFormaQtd += 1;
      acc.semFormaReceita += receita;
    } else {
      acc.taxas += taxaSobreReceita(receita, forma, p.parcelas, cfg).valor;
    }

    if (p.created_at) {
      const dia = diaDe(p.created_at);
      acc.porDia.set(dia, (acc.porDia.get(dia) || 0) + receita);
    }
  }

  return {
    ...acc,
    extras: {
      qtdPedidos,
      receitaProdutos: round2(receitaProdutos),
      receitaMaoObra: round2(receitaMaoObra),
      saidasSemPedido: {
        movimentacoes: Number(manuais._count?._all || 0),
        unidades: Number(manuais._sum?.quantidade || 0),
      },
    },
  };
}
