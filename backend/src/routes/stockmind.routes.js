import { Router } from 'express';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { prisma } from '../config/prisma.js';
import {
  calcularEstoqueParado, diaNoFuso, ehExcluidoDoPipeline, nomeCompleto,
} from '../services/estoqueParado.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// stockmind/ é irmão de backend/ na raiz do repo. /previsao só lê o JSON pré-calculado
// (gerado sob demanda por stockmind/scripts/gerar_previsao_producao.py, rodando na
// própria EC2). /estoque-parado lê o banco e junta a última venda antiga desse JSON.
const STOCKMIND_DIR = path.join(__dirname, '..', '..', '..', 'stockmind');
// As variáveis de ambiente existem só para os testes apontarem para arquivos temporários.
const PREVISAO_PATH = process.env.STOCKMIND_PREVISAO_PATH || path.join(STOCKMIND_DIR, 'saida', 'previsao_atual.json');
// Data de chegada informada à mão: { "<id do SKU>": "AAAA-MM-DD" } (compra ainda não lançada como entrada).
const CHEGADAS_PATH = process.env.STOCKMIND_CHEGADAS_PATH || path.join(STOCKMIND_DIR, 'chegadas_manuais.json');

export const stockmindRouter = Router();

/** GET /api/stockmind/previsao — admin-only (montado com requireAdmin no app.js). */
stockmindRouter.get('/previsao', async (req, res, next) => {
  try {
    const conteudo = await readFile(PREVISAO_PATH, 'utf-8');
    res.type('application/json').send(conteudo);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.status(404).json({
        error: true,
        message: 'Previsão ainda não foi gerada — rode gerar_previsao_producao.py.',
      });
    }
    console.error('GET /api/stockmind/previsao ERRO:', e);
    next(e);
  }
});

async function lerJsonOpcional(arquivo) {
  try {
    return JSON.parse(await readFile(arquivo, 'utf-8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    console.error(`StockMind: não consegui ler ${arquivo}:`, e.message);
    return null;
  }
}

/** { id: { data, nivel } } com a última venda do HISTÓRICO (Excel/livro caixa) que o script
 *  Python calculou por SKU. Vazio se a previsão ainda não foi gerada. */
function historicoPorSku(previsao) {
  const mapa = new Map();
  for (const g of previsao?.grupos ?? []) {
    for (const s of g.skus ?? []) {
      if (s.ultimaVendaHistorico) mapa.set(s.id, { data: s.ultimaVendaHistorico, nivel: s.ultimaVendaHistoricoNivel ?? null });
    }
  }
  return mapa;
}

const chegadaValida = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** GET /api/stockmind/estoque-parado — admin-only. Estoque, custo, última venda e última
 *  entrada de compra vêm do banco AGORA; só a última venda ANTIGA vem do JSON da previsão. */
stockmindRouter.get('/estoque-parado', async (req, res, next) => {
  try {
    const [produtos, vendas, entradas, previsao, chegadas] = await Promise.all([
      prisma.estoque.findMany({
        where: { marca: { ativo: true } },
        select: {
          id: true, produto: true, modelo: true, custo: true,
          qtd_inicial: true, entradas: true, saidas: true, em_estoque: true,
          marca: { select: { nome: true } },
        },
      }),
      // empréstimo de garantia (garantia_id preenchido) não é venda nem compra
      prisma.movimentacoes.groupBy({
        by: ['produto_id'], where: { tipo: 'SAIDA', garantia_id: null }, _max: { data_movimentacao: true },
      }),
      prisma.movimentacoes.groupBy({
        by: ['produto_id'], where: { tipo: 'ENTRADA', garantia_id: null }, _max: { data_movimentacao: true },
      }),
      lerJsonOpcional(PREVISAO_PATH),
      lerJsonOpcional(CHEGADAS_PATH),
    ]);
    const ultimaVenda = new Map(vendas.map((v) => [v.produto_id, v._max.data_movimentacao]));
    const ultimaEntrada = new Map(entradas.map((e) => [e.produto_id, e._max.data_movimentacao]));
    const historico = historicoPorSku(previsao);

    const skus = produtos
      .map((p) => ({ p, nome: nomeCompleto(p.produto, p.modelo) }))
      .filter(({ nome }) => !ehExcluidoDoPipeline(nome))
      .map(({ p, nome }) => {
        // mesmo saldo de estoqueResumo.routes.js (em_estoque é cache e costuma vir NULL)
        const bruto = p.em_estoque != null
          ? Number(p.em_estoque)
          : Number(p.qtd_inicial ?? 0) + Number(p.entradas ?? 0) - Number(p.saidas ?? 0);
        return {
          id: p.id,
          produto: nome,
          marca: p.marca.nome,
          saldo: Number.isFinite(bruto) ? bruto : 0,
          custo: Number(p.custo),
          vendaProducao: ultimaVenda.get(p.id) ?? null,
          vendaHistorico: historico.get(p.id)?.data ?? null,
          nivelHistorico: historico.get(p.id)?.nivel ?? null,
          entrada: ultimaEntrada.get(p.id) ?? null,
          entradaManual: chegadaValida(chegadas?.[String(p.id)]),
        };
      });

    const resultado = calcularEstoqueParado({ skus, hoje: diaNoFuso(new Date()) });
    res.json({ ...resultado, previsaoGeradaEm: previsao?.gerado_em ?? null });
  } catch (e) {
    console.error('GET /api/stockmind/estoque-parado ERRO:', e);
    next(e);
  }
});
