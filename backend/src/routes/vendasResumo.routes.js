// Resumo de vendas das DUAS linhas num payload só — a fonte do dashboard
// Baterias/Som/Ambos.
//
// Não reaproveita /movimentacoes/resumo porque aquela rota está montada atrás
// de requireLinha('baterias'): um usuário som-only tomaria 403 antes de entrar
// no router. Aqui o escopo é resolvido POR REQUEST (mesmo desenho de
// /api/estoque-resumo/custo, que já serve as duas linhas): a linha fora do
// escopo do usuário vem null e NÃO entra no total.
//
// A conta em si mora em services/vendasResumo.js, compartilhada com
// /movimentacoes/resumo — uma definição só de receita/custo/taxa/lucro.
import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { podeVerCusto, podeVerLinha } from '../utils/permissoes.js';
import { getTaxasConfig } from './taxas.routes.js';
import { validate } from '../middlewares/validate.js';
import { resumoPeriodoQuery } from '../schemas/vendasResumo.schema.js';
import { agregarBaterias, agregarSom, formatarBloco, somarAcc } from '../services/vendasResumo.js';

export const vendasResumoRouter = Router();

/** GET /api/vendas-resumo?from=&to=
 *  { data: { total, baterias, som } } — baterias/som null quando fora do
 *  escopo. custoVendido/lucroBruto/lucroLiquido só para quem vê custo, nos
 *  três blocos (esconder só no front deixaria o número exposto na resposta).
 *
 *  from/to são OPCIONAIS e recortam o período (Baterias por data_movimentacao,
 *  Som por created_at do pedido). Sem eles o payload é byte a byte o de antes
 *  — o Dashboard não passa nada e não muda. O card "Vendas da Semana" da Home
 *  é quem usa o recorte: antes ele somava movimentações no cliente sobre uma
 *  janela de 20 registros e subnotificava em 35%. */
vendasResumoRouter.get('/', validate({ query: resumoPeriodoQuery }), async (req, res, next) => {
  try {
    const verBaterias = podeVerLinha(req.user, 'baterias');
    const verSom = podeVerLinha(req.user, 'som');
    const verCusto = podeVerCusto(req.user);

    const { from, to } = req.query;
    const periodo = from || to ? { from, to } : undefined;

    // Uma leitura de config serve as duas linhas.
    const cfg = await getTaxasConfig();
    const [accBaterias, accSom] = await Promise.all([
      verBaterias ? agregarBaterias(prisma, cfg, periodo) : Promise.resolve(null),
      verSom ? agregarSom(prisma, cfg, periodo) : Promise.resolve(null),
    ]);

    // O total sai dos acumuladores CRUS (não da soma dos blocos arredondados),
    // para que lucroBruto do total feche exatamente com vendasBrutas −
    // custoVendido do total. Campos exclusivos de Som ficam fora do total: não
    // fazem sentido somados a Baterias.
    const total = formatarBloco(somarAcc(accBaterias, accSom), verCusto);

    res.json({
      data: {
        total,
        baterias: accBaterias ? formatarBloco(accBaterias, verCusto) : null,
        som: accSom ? formatarBloco(accSom, verCusto, accSom.extras) : null,
      },
    });
  } catch (e) {
    console.error('GET /api/vendas-resumo ERRO:', e);
    next(e);
  }
});
