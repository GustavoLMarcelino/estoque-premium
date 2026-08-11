import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { paginacao, envelope } from '../utils/paginacao.js';
import { requireAdmin, requirePermission } from '../middlewares/auth.js';
import { validate, idParams } from '../middlewares/validate.js';
import { criarMovimentacaoBateriaBody, editarMovimentacaoBody } from '../schemas/movimentacoes.schema.js';
import { inicioDosPeriodosFechados, marcarPeriodoFechado } from '../utils/comissao.js';
import { podeVerCusto } from '../utils/permissoes.js';
import { checarMargemMinima } from '../utils/margem.js';
import { getTaxasConfig } from './taxas.routes.js';
import { agregarBaterias, formatarBloco } from '../services/vendasResumo.js';
import { dadosEstorno } from '../utils/estorno.js';
import { registrarAuditoria, ACOES, ENTIDADES } from '../utils/auditoria.js';

export const movimentacoesRouter = Router();

/* helpers */
const toInt = (v, def = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const toMoneyStr = (v, def = '0.00') => {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : def;
};

/** GET /api/movimentacoes/resumo
 * Agregados de vendas de BATERIAS para o dashboard, sobre TODAS as saídas
 * (sem paginação) com o custo do produto resolvido via relação — evita o
 * truncamento em 100 movimentações e o custo zerado de produtos fora da
 * primeira página. valor_final é UNITÁRIO (receita = valor_final × quantidade).
 *
 * A CONTA vive em services/vendasResumo.js, compartilhada com /vendas-resumo
 * (que serve as duas linhas): uma definição só de receita/custo/taxa/lucro.
 * Esta rota segue respondendo exatamente o mesmo payload de antes — o
 * dashboard atual não muda.
 */
movimentacoesRouter.get('/resumo', async (req, res, next) => {
  try {
    const taxasCfg = await getTaxasConfig();
    const acc = await agregarBaterias(prisma, taxasCfg);
    res.json({ data: formatarBloco(acc, podeVerCusto(req.user)) });
  } catch (e) {
    console.error('GET /api/movimentacoes/resumo ERRO:', e);
    next(e);
  }
});

/** GET /api/movimentacoes?produto_id=&q=&status_pagamento=&page=&pageSize= */
movimentacoesRouter.get('/', async (req, res, next) => {
  try {
    const produtoId = req.query.produto_id ? Number(req.query.produto_id) : undefined;
    const q = (req.query.q || '').toString().trim();
    /** Filtro do "Fiados em aberto" da tela de Movimentações.
     *
     *  Tem que ser AQUI, e não no frontend: a listagem pagina de 20 em 20, e
     *  filtrar o que já foi buscado esconderia todo fiado fora da página aberta
     *  — enquanto `total` e `pages` seguiriam contando a lista inteira.
     *
     *  FIADO já significa "em aberto" (quitar grava PAGO), então não há um
     *  terceiro estado a distinguir. Valor fora do par é ignorado em silêncio,
     *  como já acontece com produto_id inválido: filtro é conveniência de
     *  leitura, e derrubar a listagem inteira com 400 seria desproporcional. */
    const status = String(req.query.status_pagamento || '').trim().toUpperCase();
    const { page, pageSize, pageSizeSolicitado, skip, take } = paginacao(req.query, { padrao: 10, teto: 100 });

    const and = [];
    if (produtoId) and.push({ produto_id: produtoId });
    if (q) and.push({ estoque: { OR: [{ produto: { contains: q } }, { modelo: { contains: q } }] } });
    // Não precisa casar tipo: SAIDA junto — o POST força ENTRADA a nascer PAGO,
    // então FIADO já implica venda.
    if (status === 'FIADO' || status === 'PAGO') and.push({ status_pagamento: status });
    const where = and.length ? { AND: and } : undefined;

    const [total, data] = await Promise.all([
      prisma.movimentacoes.count({ where }),
      prisma.movimentacoes.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
        include: { estoque: { select: { produto: true, modelo: true } } },
      }),
    ]);

    // periodo_fechado (só admin): a tela avisa ANTES de salvar que a comissão
    // daquela quinzena já foi apurada e não será recalculada. Mesma marcação do
    // pedido de Som, mas pelo campo de data que a apuração de Baterias usa.
    const fechados = await inicioDosPeriodosFechados(prisma, req.user);

    res.json(envelope({
      page, pageSize, pageSizeSolicitado, total,
      data: data.map((m) => marcarPeriodoFechado(m, fechados, 'data_movimentacao')),
    }));
  } catch (e) {
    console.error('GET /api/movimentacoes ERRO:', e);
    next(e);
  }
});

/** POST /api/movimentacoes
 * body: { produto_id, tipo: 'entrada'|'saida', quantidade, valor_final? }
 */
movimentacoesRouter.post('/', requirePermission('entrada_saida'), validate({ body: criarMovimentacaoBateriaBody }), async (req, res, next) => {
  try {
    const produto_id = Number(req.body?.produto_id);
    const quantidade = toInt(req.body?.quantidade, 0);

    // normaliza tipo vindo do front para o valor exato do ENUM no MySQL
    const tipoRaw = String(req.body?.tipo || '').trim().toLowerCase();
    let tipoDbValue = null;
    if (tipoRaw === 'entrada') tipoDbValue = 'ENTRADA';
    if (tipoRaw === 'saida')   tipoDbValue = 'SAIDA';

    if (!produto_id) return res.status(400).json({ error: true, message: 'produto_id inválido ou ausente.' });
    if (!tipoDbValue) {
      return res.status(400).json({ error: true, message: `tipo inválido. Envie 'entrada' ou 'saida'. Recebido: ${req.body?.tipo}` });
    }
    if (!(quantidade > 0)) return res.status(400).json({ error: true, message: 'quantidade deve ser > 0.' });

    // se vier vazio, use "0.00" (coluna é NOT NULL no seu schema)
    const valor_final = toMoneyStr(req.body?.valor_final, '0.00');

    // vendedor: aplicável apenas em saídas
    const vendedorRaw = req.body?.vendedor;
    const vendedor = tipoDbValue === 'SAIDA' && vendedorRaw
      ? String(vendedorRaw).trim().slice(0, 50)
      : null;

    // forma de pagamento: só em saída (venda); parcelas só fazem sentido no
    // crédito (zod já limitou a 1–10). Entrada é compra — fica tudo null.
    const forma_pagamento = tipoDbValue === 'SAIDA' && req.body?.forma_pagamento
      ? req.body.forma_pagamento
      : null;
    const parcelas = forma_pagamento === 'credito'
      ? toInt(req.body?.parcelas, 1) || 1
      : null;

    // FIADO só existe em venda. ENTRADA é compra do fornecedor — o pagamento a
    // ele não é modelado aqui, então o campo é ignorado e a linha nasce PAGO.
    // Ausente também é PAGO: o caso normal não exige nada de quem lança.
    const status_pagamento = tipoDbValue === 'SAIDA' && req.body?.status_pagamento === 'FIADO'
      ? 'FIADO'
      : 'PAGO';

    // Só existe em venda fiado. Numa venda paga o campo não tem significado, e
    // deixá-lo passar gravaria nome de cliente numa linha que não deve nada —
    // depois ninguém saberia dizer se aquilo foi dívida ou sujeira de payload.
    // O zod já garante que, se o status é FIADO, o nome veio (e não é espaço).
    const cliente_fiado = status_pagamento === 'FIADO'
      ? String(req.body.cliente_fiado).trim().slice(0, 150)
      : null;

    // ENTRADA pode repor o custo e corrigir os preços de venda no mesmo request.
    // Mexer em custo/preço continua sendo privilégio de admin (é o mesmo que
    // PUT /api/estoque exige) — a permissão 'entrada_saida' sozinha não basta.
    const mexeEmPrecoOuCusto = ['custo', 'valor_vista', 'valor_parcelado']
      .some((k) => req.body?.[k] != null && req.body[k] !== '');
    if (mexeEmPrecoOuCusto) {
      if (tipoDbValue !== 'ENTRADA') {
        return res.status(400).json({ error: true, message: 'Custo e preços só podem ser alterados numa entrada.' });
      }
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: true, message: 'Apenas administradores podem alterar custo e preços.' });
      }
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const prod = await tx.estoque.findUnique({ where: { id: produto_id } });
      if (!prod) throw new Error('Produto não encontrado');

      const emEstoque = Number(
        prod.em_estoque ??
          (Number(prod.qtd_inicial || 0) + Number(prod.entradas || 0) - Number(prod.saidas || 0))
      );

      if (tipoDbValue === 'SAIDA' && quantidade > emEstoque) {
        throw Object.assign(new Error('Quantidade de saída excede o estoque atual'), { statusCode: 409 });
      }

      // Trava anti-prejuízo da ENTRADA: subir o custo não pode deixar nenhum
      // dos dois preços abaixo de 10% de margem líquida. A checagem roda ANTES
      // de qualquer escrita e dentro da transação — reprovou, nada é gravado
      // (nem a movimentação, nem o custo). O usuário corrige o preço na tela e
      // reenvia; não existe forçar abaixo do mínimo.
      const precoFinal = {};
      if (mexeEmPrecoOuCusto) {
        const custoFinal = req.body.custo != null && req.body.custo !== ''
          ? toMoneyStr(req.body.custo) : prod.custo;
        // valor_venda espelha o à vista no resto do sistema; mantém o espelho.
        const vistaFinal = req.body.valor_vista != null && req.body.valor_vista !== ''
          ? toMoneyStr(req.body.valor_vista) : prod.valor_vista;
        const parceladoFinal = req.body.valor_parcelado != null && req.body.valor_parcelado !== ''
          ? toMoneyStr(req.body.valor_parcelado) : prod.valor_parcelado;

        const erroMargem = checarMargemMinima({
          custo: custoFinal,
          valor_venda: vistaFinal ?? prod.valor_venda,
          valor_vista: vistaFinal,
          valor_parcelado: parceladoFinal,
        });
        if (erroMargem) throw Object.assign(new Error(erroMargem), { statusCode: 400 });

        precoFinal.custo = custoFinal;
        if (req.body.valor_vista != null && req.body.valor_vista !== '') {
          precoFinal.valor_vista = vistaFinal;
          precoFinal.valor_venda = vistaFinal;
        }
        if (req.body.valor_parcelado != null && req.body.valor_parcelado !== '') {
          precoFinal.valor_parcelado = parceladoFinal;
        }
      }

      // cria movimentação conectando o relacionamento obrigatório
      const mov = await tx.movimentacoes.create({
        data: {
          // ajuste o nome do relation aqui se no schema não for "estoque"
          estoque: { connect: { id: produto_id } },
          tipo: tipoDbValue,            // ENUM ('ENTRADA' | 'SAIDA') ou minúsculo se seu ENUM for minúsculo
          quantidade,
          valor_final,                  // NUNCA nulo (usa "0.00" por padrão)
          vendedor,                     // somente em saídas (null caso contrário)
          forma_pagamento,              // somente em saídas (venda)
          parcelas,                     // somente crédito (1–10)
          status_pagamento,             // PAGO por padrão; FIADO só em saída
          cliente_fiado,                // só no fiado (null caso contrário)
          // Sempre null na criação: quitar é um segundo ato (PUT). Preencher
          // aqui duplicaria data_movimentacao e faria "vendido em" e "quitado
          // em" virarem o mesmo dado.
          data_pagamento: null,
          data_movimentacao: now,
          user_id: req.user.id,         // trilha de auditoria (vem do requireAuth)
          created_by: req.user.email,
        },
      });

      // ENTRADA que mexe em custo/preço: o valor ANTERIOR do produto só existe
      // aqui, neste instante. `estoque` guarda o custo de AGORA, e o dashboard
      // calcula o lucro de TODA venda passada com ele (vendasResumo.js usa
      // estoque.custo, não um congelado na venda) — então repor o custo
      // reescreve lucro histórico e nada registra o que havia antes.
      //
      // Excluir a entrada depois NÃO desfaz isso: dadosEstorno mexe só em
      // `entradas`, nunca em custo. Este log é a única resposta possível para
      // "o que este lançamento mudou, e mudou mesmo?" — daí guardar também o
      // `aplicado`, sem o qual não dá para distinguir custo reposto igual de
      // custo alterado.
      //
      // SÓ quando mexeEmPrecoOuCusto (que a essa altura já implica ENTRADA de
      // admin, barrado acima): reposição pura de quantidade não gera linha, para
      // o diário não virar cópia da tabela de movimentações. Dentro da MESMA
      // transação — se a margem reprovar, o log some junto no rollback.
      if (mexeEmPrecoOuCusto) {
        await registrarAuditoria(tx, {
          linha: 'baterias',
          entidade: ENTIDADES.MOVIMENTACAO,
          entidadeId: mov.id,
          acao: ACOES.CRIACAO,
          conteudoAnterior: {
            produto: {
              id: prod.id,
              produto: prod.produto,
              modelo: prod.modelo,
              custo: prod.custo,
              valor_vista: prod.valor_vista,
              valor_parcelado: prod.valor_parcelado,
              valor_venda: prod.valor_venda,
            },
            aplicado: precoFinal,
          },
          user: req.user,
        });
      }

      // atualiza agregados
      if (tipoDbValue === 'ENTRADA') {
        // custo/preços vão no MESMO update dos agregados: um só write atômico.
        await tx.estoque.update({
          where: { id: produto_id },
          data: { entradas: (prod.entradas ?? 0) + quantidade, ...precoFinal },
        });
      } else {
        await tx.estoque.update({
          where: { id: produto_id },
          data: { saidas: (prod.saidas ?? 0) + quantidade },
        });
      }

      return mov;
    });

    res.status(201).json(result);
  } catch (e) {
    const status = e?.statusCode || (e?.code === 'P2003' ? 409 : 500);
    const message = e?.message || 'Erro ao registrar movimentação';
    if (status !== 500) return res.status(status).json({ error: true, message });
    console.error('POST /api/movimentacoes ERRO:', e);
    next(e);
  }
});

/** PUT /api/movimentacoes/:id — edita uma VENDA de Baterias.
 *
 * Uma venda de Baterias é UMA linha: não há tabela de itens, nem total
 * derivado. Por isso aqui não existe o "estorna tudo e reaplica" da Fase D de
 * Som — a movimentação editada É o registro de estoque, não uma sombra dele.
 * Sobra estornar a baixa antiga, validar e aplicar a nova.
 *
 * SÓ SAIDA. Editar uma ENTRADA fica de fora de propósito: a criação de entrada
 * pode reescrever custo e preços DO PRODUTO, e o diário guarda a movimentação,
 * não o custo anterior do produto — uma edição de entrada seria irreversível
 * pelo log. Corrigir entrada continua sendo excluir e relançar.
 *
 * O QUE NÃO SE EDITA (barrado pelo .strict() do schema): data_movimentacao
 * decide a quinzena da comissão e o período do dashboard; tipo, garantia_id e
 * motivo definem o que a linha É; user_id/created_by são histórico.
 */
movimentacoesRouter.put(
  '/:id',
  requireAdmin,
  validate({ params: idParams, body: editarMovimentacaoBody }),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const body = req.body || {};
      const mexe = (campo) => body[campo] !== undefined && body[campo] !== null;

      /** Só de pagamento: nenhum campo que mexe em estoque ou no valor da venda.
       *
       *  Quitar um fiado não move uma unidade sequer, mas o fluxo normal deste
       *  PUT estorna a baixa e reaplica — dois writes inúteis e, pior, um 409
       *  possível: se `saidas` do produto estiver inconsistente, dadosEstorno
       *  reprova e o registro de um pagamento REAL falharia por causa de
       *  estoque. O atalho vai direto ao update do cabeçalho. */
      const CAMPOS_PAGAMENTO = ['status_pagamento', 'data_pagamento', 'cliente_fiado'];
      const soPagamento = Object.keys(body).length > 0
        && Object.keys(body).every((k) => CAMPOS_PAGAMENTO.includes(k));

      /** Cabeçalho de pagamento a gravar, a partir do que veio no body. */
      function dadosPagamento() {
        const data = {};
        if (mexe('status_pagamento')) {
          data.status_pagamento = body.status_pagamento;
          // Quitar sem informar data usa o instante da quitação; com data
          // informada respeita ("pagou ontem, estou registrando hoje").
          // Voltar para FIADO limpa — senão sobraria a data de um pagamento
          // desfeito, e o registro afirmaria "em aberto, quitado em X".
          data.data_pagamento = body.status_pagamento === 'PAGO'
            ? (mexe('data_pagamento') ? body.data_pagamento : new Date())
            : null;
        } else if (mexe('data_pagamento')) {
          data.data_pagamento = body.data_pagamento;
        }
        // Corrigir o nome não move uma unidade de estoque — por isso entra no
        // atalho. Quitar NÃO apaga o nome: quem devia continua registrado, é o
        // histórico do que aconteceu.
        if (mexe('cliente_fiado')) data.cliente_fiado = body.cliente_fiado;
        return data;
      }

      const atualizado = await prisma.$transaction(async (tx) => {
        const antes = await tx.movimentacoes.findUnique({ where: { id } });
        if (!antes) throw Object.assign(new Error('Movimentação não encontrada.'), { statusCode: 404 });

        // Mesma trava do DELETE: empréstimo de garantia não é venda. A garantia
        // continua apontando para esta linha, e mexer no produto/quantidade dela
        // dessincronizaria o empréstimo do estoque.
        if (antes.garantia_id != null) {
          throw Object.assign(
            new Error('Esta movimentação é de empréstimo de garantia, não é uma venda. Use a devolução do empréstimo.'),
            { statusCode: 409 },
          );
        }

        if (String(antes.tipo).toUpperCase() !== 'SAIDA') {
          throw Object.assign(
            new Error('Só é possível editar venda (saída). Para corrigir uma entrada, exclua e lance novamente.'),
            { statusCode: 409 },
          );
        }

        /** Marcar como fiado exige saber de quem se cobra.
         *
         *  O zod não consegue impor isto no PUT: ele não enxerga a linha, e
         *  reabrir um fiado que JÁ tem nome gravado (desmarcar "cliente pagou")
         *  seria recusado à toa. Aqui há o `antes` — então a regra vira "tem que
         *  haver nome DEPOIS desta edição", venha ele do body ou já do banco.
         *
         *  Na prática pega o fiado legado: as linhas criadas antes desta coluna
         *  têm cliente_fiado NULL, e reabri-las produziria de novo a dívida
         *  anônima. Vale para os dois caminhos (atalho e edição completa) por
         *  estar antes da bifurcação. */
        if (body.status_pagamento === 'FIADO' && !body.cliente_fiado && !antes.cliente_fiado) {
          throw Object.assign(
            new Error('Informe o nome do cliente ao marcar como fiado.'),
            { statusCode: 400 },
          );
        }

        // ── ATALHO: quitação (ou reabertura) pura ──
        // Passa DEPOIS das travas de garantia e tipo — quitar um empréstimo não
        // faz sentido, e a mensagem de recusa tem que ser a mesma. Daqui para
        // baixo nada de estoque acontece: sem estorno, sem revalidação de saldo,
        // sem increment. O diário continua registrando (é edição de venda), pelo
        // mesmo caminho e na mesma transação.
        if (soPagamento) {
          await registrarAuditoria(tx, {
            linha: 'baterias',
            entidade: ENTIDADES.MOVIMENTACAO,
            entidadeId: antes.id,
            acao: ACOES.EDICAO,
            conteudoAnterior: { movimentacao: antes },
            user: req.user,
          });
          return tx.movimentacoes.update({ where: { id }, data: dadosPagamento() });
        }

        const produtoNovoId = mexe('produto_id') ? Number(body.produto_id) : antes.produto_id;
        const quantidadeNova = mexe('quantidade') ? Number(body.quantidade) : antes.quantidade;
        const trocouProduto = produtoNovoId !== antes.produto_id;
        const mudouQuantidade = quantidadeNova !== antes.quantidade;

        // O backend NUNCA puxa o preço atual do catálogo: mudar a quantidade de
        // uma venda de julho não pode reprecificá-la pela tabela de hoje. Se o
        // que se cobra muda, a tela diz por quanto — mesma regra da Fase D de Som.
        if ((trocouProduto || mudouQuantidade) && !mexe('valor_final')) {
          throw Object.assign(
            new Error('Informe o valor unitário ao mudar o produto ou a quantidade — o preço da venda não é recalculado pela tabela atual.'),
            { statusCode: 400 },
          );
        }

        const prodAntigo = await tx.estoque.findUnique({ where: { id: antes.produto_id } });
        if (!prodAntigo) {
          throw Object.assign(new Error('Produto da movimentação não encontrado.'), { statusCode: 409 });
        }

        // Diário ANTES de qualquer escrita, na MESMA transação: se o estorno ou a
        // validação abaixo reprovarem, o log some junto no rollback. Não existe
        // "registrou uma edição que não aconteceu".
        await registrarAuditoria(tx, {
          linha: 'baterias',
          entidade: ENTIDADES.MOVIMENTACAO,
          entidadeId: antes.id,
          acao: ACOES.EDICAO,
          conteudoAnterior: {
            movimentacao: antes,
            produto: { id: prodAntigo.id, produto: prodAntigo.produto, modelo: prodAntigo.modelo },
          },
          user: req.user,
        });

        // 1) Estorna a baixa antiga. Falha com 409 (rollback) se não couber no
        //    acumulado, em vez de truncar em zero — Fase A.
        const estorno = dadosEstorno({
          tipo: antes.tipo,
          quantidade: antes.quantidade,
          produto: prodAntigo,
          rotulo: [prodAntigo.produto, prodAntigo.modelo].filter(Boolean).join(' - '),
        });
        if (estorno) await tx.estoque.update({ where: { id: antes.produto_id }, data: estorno });

        // 2) Valida SOBRE O SALDO JÁ ESTORNADO. A ordem é o ponto: subir de 2
        //    para 3 un. num produto com em_estoque 0 é válido, porque as 2 desta
        //    venda voltaram primeiro. Validar antes daria 409 indevido. Quando o
        //    produto não muda, esta releitura traz a linha já estornada.
        const prodNovo = await tx.estoque.findUnique({ where: { id: produtoNovoId } });
        if (!prodNovo) {
          throw Object.assign(new Error(`Produto ${produtoNovoId} não encontrado.`), { statusCode: 404 });
        }
        const disponivel = Number(
          prodNovo.em_estoque
            ?? (Number(prodNovo.qtd_inicial || 0) + Number(prodNovo.entradas || 0) - Number(prodNovo.saidas || 0)),
        );
        if (quantidadeNova > disponivel) {
          const nome = [prodNovo.produto, prodNovo.modelo].filter(Boolean).join(' - ');
          throw Object.assign(
            new Error(`Estoque insuficiente de "${nome}": ${disponivel} un. disponíveis para uma saída de ${quantidadeNova}. Nada foi alterado.`),
            { statusCode: 409 },
          );
        }

        // 3) Aplica a nova baixa. increment atômico (SET saidas = saidas + n),
        //    mesmo padrão do POST e da Fase D de Som.
        await tx.estoque.update({
          where: { id: produtoNovoId },
          data: { saidas: { increment: quantidadeNova } },
        });

        // 4) Cabeçalho. parcelas só existem no crédito: trocar para PIX sem
        //    zerá-las deixaria a taxa do dashboard calculando por um crédito que
        //    não existe mais (mesma normalização do POST).
        const formaFinal = mexe('forma_pagamento') ? body.forma_pagamento : antes.forma_pagamento;
        const parcelasFinal = formaFinal === 'credito'
          ? (mexe('parcelas') ? toInt(body.parcelas, 1) || 1 : (antes.parcelas ?? 1))
          : null;

        const data = {
          produto_id: produtoNovoId,
          quantidade: quantidadeNova,
          forma_pagamento: formaFinal,
          parcelas: parcelasFinal,
        };
        if (mexe('valor_final')) data.valor_final = toMoneyStr(body.valor_final);
        if (mexe('vendedor')) data.vendedor = body.vendedor;
        // Pagamento pode vir junto de uma edição de venda de verdade (ex.: corrigir
        // a quantidade e quitar no mesmo salvamento). Mesma regra do atalho.
        Object.assign(data, dadosPagamento());

        return tx.movimentacoes.update({ where: { id }, data });
      });
      // Sem timeout customizado: são 3 leituras e 3 escritas de tamanho fixo,
      // que não crescem com nada. O default (5s) sobra. A exceção de 15s da Fase
      // D de Som existe porque lá o custo cresce com o nº de itens.

      const fechados = await inicioDosPeriodosFechados(prisma, req.user);
      res.json({ data: marcarPeriodoFechado(atualizado, fechados, 'data_movimentacao') });
    } catch (e) {
      const status = e?.statusCode || 500;
      if (status !== 500) return res.status(status).json({ error: true, message: e.message });
      console.error('PUT /api/movimentacoes/:id ERRO:', e);
      next(e);
    }
  },
);

/** DELETE /api/movimentacoes/:id
 * Desfaz agregados e remove a movimentação. Apenas admin (trilha de auditoria).
 * Sem janela de tempo: qualquer venda, a qualquer momento.
 *
 * NÃO apaga movimentação de EMPRÉSTIMO de garantia (garantia_id preenchido):
 * ela não é venda — é a ida/volta da bateria emprestada, e a garantia continua
 * apontando para ela. Apagar por aqui estornaria o estoque e deixaria a
 * garantia órfã. O empréstimo se desfaz pelo fluxo de devolução.
 */
movimentacoesRouter.delete('/:id', requireAdmin, validate({ params: idParams }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.$transaction(async (tx) => {
      const mov = await tx.movimentacoes.findUnique({ where: { id } });
      if (!mov) throw Object.assign(new Error('Movimentação não encontrada.'), { statusCode: 404 });

      if (mov.garantia_id != null) {
        throw Object.assign(
          new Error('Esta movimentação é de empréstimo de garantia, não é uma venda. Use a devolução do empréstimo.'),
          { statusCode: 409 },
        );
      }

      const prod = await tx.estoque.findUnique({ where: { id: mov.produto_id } });
      if (!prod) throw Object.assign(new Error('Produto da movimentação não encontrado.'), { statusCode: 409 });

      // Diário ANTES de destruir, na MESMA transação: se o estorno abaixo
      // reprovar, o log some junto no rollback (não registra exclusão que não
      // aconteceu); se o log falhar, nada é apagado. Auditoria não é opcional.
      await registrarAuditoria(tx, {
        linha: 'baterias',
        entidade: ENTIDADES.MOVIMENTACAO,
        entidadeId: mov.id,
        acao: ACOES.EXCLUSAO,
        // Guarda também o produto: ele pode ser apagado depois, e sem isto o
        // snapshot viraria um produto_id sem nome.
        conteudoAnterior: {
          movimentacao: mov,
          produto: { id: prod.id, produto: prod.produto, modelo: prod.modelo },
        },
        user: req.user,
      });

      // Falha (rollback) em vez de truncar em zero; decrement é atômico no SQL.
      const data = dadosEstorno({
        tipo: mov.tipo,
        quantidade: mov.quantidade,
        produto: prod,
        rotulo: [prod.produto, prod.modelo].filter(Boolean).join(' - '),
      });
      if (data) await tx.estoque.update({ where: { id: mov.produto_id }, data });

      await tx.movimentacoes.delete({ where: { id } });
    });

    res.status(204).end();
  } catch (e) {
    const status = e?.statusCode || 500;
    if (status !== 500) return res.status(status).json({ error: true, message: e.message });
    console.error('DELETE /api/movimentacoes/:id ERRO:', e);
    next(e);
  }
});
