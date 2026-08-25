// src/pages/stockmind/mockData.js
//
// Dados estáticos do módulo StockMind (IA). Isolado de propósito: quando o
// backend real existir, só este arquivo muda — os componentes consomem os
// mesmos formatos (PRODUTOS_MOCK / DEMANDA_POR_CATEGORIA) vindos de uma API.
//
// giro: 'alto' | 'medio' | 'baixo' | 'baixa_confianca'
// confianca: 'alta' | 'media' | 'baixa'
// prioridade: 'alta' | 'media' | 'baixa'
// quantidadeSugerida / justificativa: só preenchidos para itens em risco
// (estoqueAtual abaixo ou no limite do estoqueMinimo).

export const CATEGORIAS = ['Carro', 'Moto', 'Caminhão', 'Estacionária'];

export const PRODUTOS_MOCK = [
  {
    id: 1,
    produto: 'Bateria 60Ah',
    categoria: 'Carro',
    estoqueAtual: 4,
    estoqueMinimo: 10,
    demandaPrevista30d: 22,
    giro: 'alto',
    confianca: 'alta',
    prioridade: 'alta',
    quantidadeSugerida: 24,
    justificativa: 'Produto de alto giro, estoque abaixo do mínimo configurado e previsão de saída elevada para os próximos 30 dias.',
  },
  {
    id: 2,
    produto: 'Bateria Moto 7Ah',
    categoria: 'Moto',
    estoqueAtual: 2,
    estoqueMinimo: 12,
    demandaPrevista30d: 30,
    giro: 'alto',
    confianca: 'alta',
    prioridade: 'alta',
    quantidadeSugerida: 32,
    justificativa: 'Item mais vendido da linha Moto — estoque crítico frente à demanda prevista; risco alto de ruptura ainda neste horizonte.',
  },
  {
    id: 3,
    produto: 'Bateria Estacionária 150Ah',
    categoria: 'Estacionária',
    estoqueAtual: 1,
    estoqueMinimo: 4,
    demandaPrevista30d: 10,
    giro: 'alto',
    confianca: 'media',
    prioridade: 'alta',
    quantidadeSugerida: 10,
    justificativa: 'Estoque quase zerado e demanda em alta na linha Estacionária; confiança média por histórico de vendas mais curto.',
  },
  {
    id: 4,
    produto: 'Bateria 45Ah',
    categoria: 'Carro',
    estoqueAtual: 8,
    estoqueMinimo: 8,
    demandaPrevista30d: 10,
    giro: 'medio',
    confianca: 'alta',
    prioridade: 'media',
    quantidadeSugerida: 6,
    justificativa: 'Estoque no limite do mínimo configurado; giro médio, mas a demanda prevista supera o saldo disponível.',
  },
  {
    id: 5,
    produto: 'Bateria Estacionária 100Ah',
    categoria: 'Estacionária',
    estoqueAtual: 5,
    estoqueMinimo: 8,
    demandaPrevista30d: 12,
    giro: 'medio',
    confianca: 'media',
    prioridade: 'media',
    quantidadeSugerida: 9,
    justificativa: 'Estoque abaixo do mínimo com giro médio; recomenda-se reposição preventiva dentro do horizonte de 30 dias.',
  },
  {
    id: 6,
    produto: 'Bateria Caminhão 150Ah',
    categoria: 'Caminhão',
    estoqueAtual: 3,
    estoqueMinimo: 3,
    demandaPrevista30d: 4,
    giro: 'baixo',
    confianca: 'baixa',
    prioridade: 'baixa',
    quantidadeSugerida: null,
    justificativa: null,
  },
  {
    id: 7,
    produto: 'Bateria 70Ah',
    categoria: 'Carro',
    estoqueAtual: 12,
    estoqueMinimo: 10,
    demandaPrevista30d: 18,
    giro: 'alto',
    confianca: 'alta',
    prioridade: 'media',
    quantidadeSugerida: 8,
    justificativa: 'Estoque dentro do mínimo, mas a demanda prevista é alta — reposição preventiva evita ruptura no próximo ciclo.',
  },
  {
    id: 8,
    produto: 'Bateria Moto 9Ah',
    categoria: 'Moto',
    estoqueAtual: 15,
    estoqueMinimo: 6,
    demandaPrevista30d: 9,
    giro: 'medio',
    confianca: 'alta',
    prioridade: 'baixa',
    quantidadeSugerida: null,
    justificativa: null,
  },
  {
    id: 9,
    produto: 'Bateria Moto 5Ah',
    categoria: 'Moto',
    estoqueAtual: 7,
    estoqueMinimo: 5,
    demandaPrevista30d: 6,
    giro: 'baixa_confianca',
    confianca: 'baixa',
    prioridade: 'baixa',
    quantidadeSugerida: null,
    justificativa: null,
  },
  {
    id: 10,
    produto: 'Bateria Caminhão 200Ah',
    categoria: 'Caminhão',
    estoqueAtual: 6,
    estoqueMinimo: 2,
    demandaPrevista30d: 2,
    giro: 'baixo',
    confianca: 'alta',
    prioridade: 'baixa',
    quantidadeSugerida: null,
    justificativa: null,
  },
];

// Derivado do mock (soma de demandaPrevista30d por categoria) — quando a API
// real existir, este agregado passa a vir pronto do backend.
export const DEMANDA_POR_CATEGORIA = CATEGORIAS.map((categoria) => ({
  categoria,
  demanda: PRODUTOS_MOCK
    .filter((p) => p.categoria === categoria)
    .reduce((soma, p) => soma + p.demandaPrevista30d, 0),
}));
