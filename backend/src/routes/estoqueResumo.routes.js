// Resumos do estoque por linha, todos calculados NO SERVIDOR:
//   /custo    — Σ (custo × qtd), atrás de ver_custo (dado sensível).
//   /venda    — Σ (preço parcelado × qtd), aberto a quem opera a linha.
//   /criticos — produtos com saldo <= qtd_minima, contagem + lista.
//
// Duas razões deram origem a estas rotas. A primeira é sigilo: o custo item a
// item não pode sair da API (sanitizeCusto o remove de /api/estoque), então a
// Home nem teria como somar. A segunda vale para todas — /api/estoque corta o
// pageSize em 100, e calcular no cliente truncava sem avisar: o valor de venda
// vinha R$ 20 mil menor, e 3 produtos críticos de Som simplesmente não
// existiam para a Home.
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { podeVerCusto, podeVerLinha } from '../utils/permissoes.js';
import { round2 } from '../utils/taxas.js';

export const estoqueResumoRouter = Router();

/** Saldo REAL em estoque (coluna gerada no MySQL; em dev pode vir nula).
 *  Pode ser negativo — negativo é inconsistência de dados, e quem lista
 *  produto crítico precisa ver isso, não um zero maquiado. */
const saldoDe = (p) => {
  const bruto = p?.em_estoque != null
    ? Number(p.em_estoque)
    : Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0);
  return Number.isFinite(bruto) ? bruto : 0;
};

/** Saldo para efeito de SOMA, com piso em 0: saldo negativo não pode ABATER o
 *  imobilizado — viraria um total menor do que a realidade. */
const emEstoqueDe = (p) => Math.max(0, saldoDe(p));

/** Colunas de saldo que todo cálculo daqui precisa ler. */
const COLUNAS_SALDO = { em_estoque: true, qtd_inicial: true, entradas: true, saidas: true };

/** Preço unitário de venda: o parcelado (10x) é o preço de vitrine da loja.
 *  Cai em valor_venda quando o parcelado é nulo — mesma convenção de
 *  margem.js e precoTabelaSom. Hoje NENHUM produto do catálogo está sem
 *  parcelado, mas sem o fallback um cadastro futuro sem preço entraria como
 *  R$ 0 e sumiria do total em silêncio, que é o pior tipo de erro num KPI.
 *
 *  Só a peça: mão de obra de classe NÃO entra. O KPI mede o que a prateleira
 *  vale; serviço não está em estoque. */
const precoVendaDe = (p) => Number(p?.valor_parcelado ?? p?.valor_venda ?? 0);

/** Soma um valor imobilizado do estoque: Σ (campo × quantidade em estoque).
 *  Lê só as colunas necessárias e agrega em memória — o catálogo da loja é de
 *  centenas de linhas, não de milhões; troca por $queryRaw só se isso mudar de
 *  ordem de grandeza.
 *
 *  unitario: (row) => preço/custo unitário. As duas rotas compartilham a
 *  mecânica (saldo, piso em 0, round2) e divergem só nesta função — é o que
 *  garante que "custo imobilizado" e "valor de venda" nunca contem itens de
 *  forma diferente. */
async function somaImobilizado(delegate, { colunas, unitario }) {
  const rows = await delegate.findMany({
    select: { ...colunas, ...COLUNAS_SALDO },
  });
  let valor = 0;
  let itens = 0;
  for (const r of rows) {
    const qtd = emEstoqueDe(r);
    valor += unitario(r) * qtd;
    itens += qtd;
  }
  return { valor: round2(valor), itens, produtos: rows.length };
}

const somaCusto = (delegate) => somaImobilizado(delegate, {
  colunas: { custo: true },
  unitario: (r) => Number(r.custo || 0),
});

const somaVenda = (delegate) => somaImobilizado(delegate, {
  colunas: { valor_parcelado: true, valor_venda: true },
  unitario: precoVendaDe,
});

/** Produtos abaixo (ou em cima) da quantidade mínima.
 *
 *  Não reusa somaImobilizado porque a forma é outra: aqui o resultado é uma
 *  LISTA filtrada, não um acumulador. O que as duas compartilham — a fórmula
 *  do saldo e as colunas que ela exige — está em saldoDe/COLUNAS_SALDO, que é
 *  onde a divergência doeria.
 *
 *  O filtro é em memória porque o Prisma 5 não compara duas colunas no where
 *  (em_estoque <= qtd_minima). Mesma escolha do /custo, e honesta na escala do
 *  catálogo: 233 produtos hoje. Sem paginação de propósito — é justamente o
 *  corte em 100 do /api/estoque que escondia 3 críticos de Som.
 *
 *  `<=` e não `<`: produto exatamente no mínimo JÁ é crítico. É o momento de
 *  repor, não o momento depois — e é a regra que a Home sempre aplicou. */
async function listarCriticos(delegate, linha) {
  const rows = await delegate.findMany({
    orderBy: { id: 'desc' }, // mesma ordem que /api/estoque devolvia
    select: { id: true, produto: true, modelo: true, qtd_minima: true, ...COLUNAS_SALDO },
  });

  const itens = rows
    .filter((r) => saldoDe(r) <= Number(r.qtd_minima ?? 0))
    .map((r) => ({
      id: r.id,
      linha, // o modal agrupa por linha; assim o total já vem auto-descritivo
      produto: r.produto,
      modelo: r.modelo,
      em_estoque: saldoDe(r),
      qtd_minima: Number(r.qtd_minima ?? 0),
    }));

  return { quantidade: itens.length, itens };
}

/** Monta o payload de três faces a partir das somas por linha. Linha fora do
 *  escopo vem null e NÃO entra no total. */
function montarResumo(baterias, som) {
  const total = {
    valor: round2((baterias?.valor ?? 0) + (som?.valor ?? 0)),
    itens: (baterias?.itens ?? 0) + (som?.itens ?? 0),
    produtos: (baterias?.produtos ?? 0) + (som?.produtos ?? 0),
  };
  return { total, baterias, som };
}

/** GET /api/estoque-resumo/custo
 *  { data: { total, baterias, som } } — cada um { valor, itens, produtos }.
 *  Linha fora do escopo do usuário vem null e NÃO entra no total. Os três
 *  valores vão juntos: a Home troca de face sem bater na API de novo. */
estoqueResumoRouter.get('/custo', async (req, res, next) => {
  try {
    // Gate server-side: sem ver_custo o número não sai daqui. Esconder só no
    // front deixaria o valor exposto para quem abrisse a resposta da API.
    if (!podeVerCusto(req.user)) {
      return res.status(403).json({ error: true, message: 'Sem permissão para ver custo.' });
    }

    const verBaterias = podeVerLinha(req.user, 'baterias');
    const verSom = podeVerLinha(req.user, 'som');

    const [baterias, som] = await Promise.all([
      verBaterias ? somaCusto(prisma.estoque) : Promise.resolve(null),
      verSom ? somaCusto(prisma.estoque_som) : Promise.resolve(null),
    ]);

    res.json({ data: montarResumo(baterias, som) });
  } catch (e) {
    console.error('GET /api/estoque-resumo/custo ERRO:', e);
    next(e);
  }
});

/** GET /api/estoque-resumo/venda
 *  { data: { total, baterias, som } } — Σ (preço de venda × em estoque).
 *
 *  SEM gate de ver_custo, e isso é deliberado: preço de venda não é dado
 *  sensível — já sai em /api/estoque para qualquer usuário (sanitizeCusto só
 *  remove custo e percentual_lucro) e está na Tabela de Preços. Pendurar este
 *  número atrás de ver_custo esconderia de vendedor que tem todo o direito de
 *  ver quanto vale a prateleira. O escopo de LINHA continua valendo.
 *
 *  Existe porque a Home somava isto no cliente, sobre /api/estoque?pageSize=500
 *  — e aquele endpoint corta o pageSize em 100. Com 148 produtos no Som, o KPI
 *  vinha faltando produto. Somando aqui não há paginação para truncar. */
estoqueResumoRouter.get('/venda', async (req, res, next) => {
  try {
    const [baterias, som] = await Promise.all([
      podeVerLinha(req.user, 'baterias') ? somaVenda(prisma.estoque) : Promise.resolve(null),
      podeVerLinha(req.user, 'som') ? somaVenda(prisma.estoque_som) : Promise.resolve(null),
    ]);

    res.json({ data: montarResumo(baterias, som) });
  } catch (e) {
    console.error('GET /api/estoque-resumo/venda ERRO:', e);
    next(e);
  }
});

/** GET /api/estoque-resumo/criticos
 *  { data: { total, baterias, som } } — cada um { quantidade, itens[] }.
 *
 *  Sem gate de ver_custo, mesmo motivo do /venda: quantidade em estoque não é
 *  dado sensível (sanitizeCusto só remove custo e percentual_lucro, e a tela
 *  de estoque já mostra o saldo). Escopo de LINHA continua valendo.
 *
 *  A lista vai junto com a contagem porque o modal da Home precisa dela, e são
 *  os críticos (dezenas), não o catálogo (centenas). */
estoqueResumoRouter.get('/criticos', async (req, res, next) => {
  try {
    const [baterias, som] = await Promise.all([
      podeVerLinha(req.user, 'baterias') ? listarCriticos(prisma.estoque, 'baterias') : Promise.resolve(null),
      podeVerLinha(req.user, 'som') ? listarCriticos(prisma.estoque_som, 'som') : Promise.resolve(null),
    ]);

    // Baterias antes de Som, a mesma ordem que o modal já agrupava.
    const total = {
      quantidade: (baterias?.quantidade ?? 0) + (som?.quantidade ?? 0),
      itens: [...(baterias?.itens ?? []), ...(som?.itens ?? [])],
    };

    res.json({ data: { total, baterias, som } });
  } catch (e) {
    console.error('GET /api/estoque-resumo/criticos ERRO:', e);
    next(e);
  }
});
