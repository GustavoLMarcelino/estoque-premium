// StockMind — "estoque parado" por SKU (sem I/O: recebe os dados já lidos).
//
// O reset de estoque de 09/10/2026 apagou as datas de entrada, então NÃO existe
// "tempo em estoque". A métrica é DIAS PARADO = hoje − a data MAIS RECENTE entre:
//   • última venda na produção (exata, por SKU);
//   • última venda do histórico Excel/livro caixa (por marca + grupo — estimada:
//     é uma cota superior da data do SKU, então os dias são um PISO);
//   • última ENTRADA de compra no sistema (bateria recém-comprada não está parada);
//   • data de chegada informada à mão (stockmind/chegadas_manuais.json), para compra
//     que ainda não foi lançada como entrada.
// Só SKUs com estoque > 0. SKU sem nenhuma data fica em "sem venda registrada" e
// fora de todas as contagens e somas (não se inventa data).

// Limites fáceis de ajustar. A tela lê os valores do payload (parametros), não os repete.
export const LIMITE_PROMOCAO_DIAS = 90; // > 90 dias sem movimento: "Colocar em promoção"
export const LIMITE_RECARGA_DIAS = 120; // > 120 dias: "Verificar carga / recarregar"
export const TOP_N = 5;
export const FUSO = 'America/Sao_Paulo';

// Quando duas datas empatam, vale a origem mais exata (ordem desta lista).
export const ORIGENS = ['venda_producao', 'venda_historico', 'entrada', 'entrada_manual'];

// Exclusão de negócio, espelho de EXCLUSOES_NOME_NEGOCIO em
// stockmind/scripts/gerar_previsao_producao.py (acessório, não é bateria).
export const EXCLUSOES_NOME_NEGOCIO = ['terminal bateria'];

/** Mesma regra de montar_nome_produto() do script Python: não repete o modelo
 *  quando ele já está no fim do nome do produto. */
export function nomeCompleto(produto, modelo) {
  const p = String(produto ?? '').trim();
  const m = String(modelo ?? '').trim();
  if (!m || p.toUpperCase().endsWith(m.toUpperCase())) return p;
  return `${p} ${m}`;
}

export const ehExcluidoDoPipeline = (nome) => EXCLUSOES_NOME_NEGOCIO.includes(String(nome).trim().toLowerCase());

/** 'AAAA-MM-DD' no fuso da loja. Datas já em texto 'AAAA-MM-DD' passam direto. */
export function diaNoFuso(data) {
  if (data == null) return null;
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('sv-SE', { timeZone: FUSO });
}

export function diasEntre(hoje, data) {
  const ms = Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${data}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const mediana = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
};

/** A data mais recente entre as candidatas, e de onde ela veio. */
export function dataDeReferencia({ vendaProducao, vendaHistorico, entrada, entradaManual }) {
  const candidatas = [
    { origem: 'venda_producao', data: diaNoFuso(vendaProducao) },
    { origem: 'venda_historico', data: diaNoFuso(vendaHistorico) },
    { origem: 'entrada', data: diaNoFuso(entrada) },
    { origem: 'entrada_manual', data: diaNoFuso(entradaManual) },
  ].filter((c) => c.data);
  if (!candidatas.length) return null;
  return candidatas.reduce((melhor, c) => {
    if (c.data > melhor.data) return c;
    if (c.data === melhor.data && ORIGENS.indexOf(c.origem) < ORIGENS.indexOf(melhor.origem)) return c;
    return melhor;
  });
}

/**
 * @param {object[]} skus  { id, produto, marca, saldo, custo, vendaProducao, vendaHistorico,
 *                           nivelHistorico, entrada, entradaManual }
 * @param {string}   hoje  'AAAA-MM-DD' (fuso da loja)
 */
export function calcularEstoqueParado({ skus, hoje, limitePromocao = LIMITE_PROMOCAO_DIAS, limiteRecarga = LIMITE_RECARGA_DIAS }) {
  const comEstoque = skus.filter((s) => s.saldo > 0);
  const itens = [];
  const sem = [];
  for (const s of comEstoque) {
    const valor = round2(s.saldo * s.custo);
    const ref = dataDeReferencia(s);
    if (!ref) {
      sem.push({ id: s.id, produto: s.produto, marca: s.marca, estoque: s.saldo, valor });
      continue;
    }
    const dias = diasEntre(hoje, ref.data);
    itens.push({
      id: s.id,
      produto: s.produto,
      marca: s.marca,
      estoque: s.saldo,
      custo: s.custo,
      valorParado: valor,
      dias,
      dataReferencia: ref.data,
      origem: ref.origem,
      // só a venda do histórico é estimada (por marca + grupo); as demais datas são do próprio SKU
      estimada: ref.origem === 'venda_historico',
      nivelHistorico: ref.origem === 'venda_historico' ? s.nivelHistorico ?? null : null,
      promocao: dias > limitePromocao,
      recarga: dias > limiteRecarga,
    });
  }

  const dias = itens.map((i) => i.dias);
  const paradosPromocao = itens.filter((i) => i.promocao);
  const paradosRecarga = itens.filter((i) => i.recarga);
  const valorParado = round2(paradosPromocao.reduce((a, i) => a + i.valorParado, 0));
  const ordenados = [...itens].sort((a, b) => b.dias - a.dias || b.valorParado - a.valorParado || a.id - b.id);

  return {
    hoje,
    parametros: { limitePromocaoDias: limitePromocao, limiteRecargaDias: limiteRecarga },
    resumo: {
      skusComEstoque: comEstoque.length,
      skusComData: itens.length,
      tempoMedioDias: itens.length ? Math.round(media(dias)) : null,
      tempoMedianoDias: itens.length ? Math.round(mediana(dias)) : null,
      skusParados: paradosPromocao.length,
      valorParado,
      valorMedioParado: paradosPromocao.length ? round2(valorParado / paradosPromocao.length) : null,
      skusPromocao: paradosPromocao.length,
      skusRecarga: paradosRecarga.length,
      valorRecarga: round2(paradosRecarga.reduce((a, i) => a + i.valorParado, 0)),
    },
    top: ordenados.slice(0, TOP_N),
    semVendaRegistrada: {
      skus: sem.length,
      unidades: sem.reduce((a, i) => a + i.estoque, 0),
      valor: round2(sem.reduce((a, i) => a + i.valor, 0)),
      itens: sem.sort((a, b) => b.valor - a.valor || a.id - b.id),
    },
  };
}
