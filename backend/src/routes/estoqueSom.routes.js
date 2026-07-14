import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAdmin } from '../middlewares/auth.js';
import { validate, idParams } from '../middlewares/validate.js';
import { criarProdutoBody, editarProdutoBody } from '../schemas/estoque.schema.js';
import { sanitizeCusto } from '../utils/permissoes.js';

export const estoqueSomRouter = Router();

/* helpers */
const toInt = (v, def = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const toMoneyStr = (v) => {
  if (v === null || v === undefined || v === '') return '0.00';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};
const fmtGarantia = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s.includes('mes')) return s;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return `${n} meses`;
};

// Só produtos de som têm classe. Inclui os dados usados no Orçamento/Tabela de
// Preços (valor_mao_obra) direto no GET, igual já fazemos com a marca.
const includeRelacoes = {
  marca: { select: { id: true, nome: true } },
  classe: { select: { id: true, nome: true, valor_mao_obra: true } },
};

/** Valida classe_id quando informado (não-nulo): precisa existir e estar ativa.
 * Retorna a mensagem de erro (string) ou null se ok. classe_id null é permitido
 * (produto sem classe). */
async function validaClasse(classeId) {
  if (classeId == null) return null;
  const classe = await prisma.classe_som.findUnique({ where: { id: Number(classeId) } });
  if (!classe || !classe.ativo) return 'Classe inválida ou desativada.';
  return null;
}

/** GET /api/estoque-som?q=&marca_id=&page=&pageSize= */
estoqueSomRouter.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const marcaId = req.query.marca_id ? Number(req.query.marca_id) : undefined;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 10, 1), 100);

    const and = [];
    if (q) and.push({ OR: [{ produto: { contains: q } }, { modelo: { contains: q } }, { marca: { nome: { contains: q } } }] });
    if (marcaId) and.push({ marca_id: marcaId });
    const where = and.length ? { AND: and } : undefined;

    const [total, data] = await Promise.all([
      prisma.estoque_som.count({ where }),
      prisma.estoque_som.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: includeRelacoes,
      }),
    ]);

    res.json({
      page, pageSize, total, pages: Math.ceil(total / pageSize),
      data: data.map((item) => sanitizeCusto(item, req.user)),
    });
  } catch (e) {
    console.error('GET /api/estoque-som ERRO:', e);
    next(e);
  }
});

/** GET /api/estoque-som/:id */
estoqueSomRouter.get('/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const item = await prisma.estoque_som.findUnique({ where: { id }, include: includeRelacoes });
    if (!item) return res.status(404).json({ error: true, message: 'Item não encontrado' });
    res.json(sanitizeCusto(item, req.user));
  } catch (e) {
    console.error('GET /api/estoque-som/:id ERRO:', e);
    next(e);
  }
});

/** POST /api/estoque-som (não enviar em_estoque — coluna gerada) */
estoqueSomRouter.post('/', requireAdmin, validate({ body: criarProdutoBody }), async (req, res, next) => {
  try {
    const { produto, modelo, marca_id, classe_id, custo, valor_venda, valor_vista, valor_parcelado, percentual_lucro, qtd_minima = 0, garantia = null, qtd_inicial = 0 } = req.body;

    if (!produto || !modelo) {
      return res.status(400).json({ error: true, message: 'produto e modelo são obrigatórios' });
    }

    // produto novo só com marca cadastrada e ativa
    const marca = await prisma.marca.findUnique({ where: { id: Number(marca_id) } });
    if (!marca || !marca.ativo) {
      return res.status(400).json({ error: true, message: 'Marca inválida ou desativada.' });
    }

    // classe é opcional; quando informada precisa existir e estar ativa
    const erroClasse = await validaClasse(classe_id);
    if (erroClasse) return res.status(400).json({ error: true, message: erroClasse });

    const data = {
      produto: String(produto).trim(),
      modelo: String(modelo).trim(),
      marca_id: marca.id,
      classe_id: classe_id != null ? Number(classe_id) : null,
      custo: toMoneyStr(custo),
      valor_venda: toMoneyStr(valor_venda),
      valor_vista: valor_vista != null && valor_vista !== '' ? toMoneyStr(valor_vista) : null,
      valor_parcelado: valor_parcelado != null && valor_parcelado !== '' ? toMoneyStr(valor_parcelado) : null,
      percentual_lucro: percentual_lucro != null ? toMoneyStr(percentual_lucro) : undefined,
      qtd_minima: toInt(qtd_minima, 0),
      garantia: fmtGarantia(garantia),
      qtd_inicial: toInt(qtd_inicial, 0),
      entradas: 0,
      saidas: 0,
    };

    if (Number(data.custo) <= 0 || Number(data.valor_venda) <= 0) {
      return res.status(400).json({ error: true, message: 'custo e valor_venda devem ser > 0' });
    }

    const novo = await prisma.estoque_som.create({ data });
    res.status(201).json(novo);
  } catch (e) {
    console.error('POST /api/estoque-som ERRO:', e);
    next(e);
  }
});

/** PUT /api/estoque-som/:id (não atualizar em_estoque aqui) */
estoqueSomRouter.put('/:id', requireAdmin, validate({ params: idParams, body: editarProdutoBody }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { produto, modelo, marca_id, classe_id, custo, valor_venda, valor_vista, valor_parcelado, percentual_lucro, qtd_minima, garantia, qtd_inicial } = req.body;

    const existente = await prisma.estoque_som.findUnique({ where: { id } });
    if (!existente) return res.status(404).json({ error: true, message: 'Item não encontrado' });

    if (marca_id != null) {
      const marca = await prisma.marca.findUnique({ where: { id: Number(marca_id) } });
      if (!marca || !marca.ativo) {
        return res.status(400).json({ error: true, message: 'Marca inválida ou desativada.' });
      }
    }

    // classe: 'classe_id' presente no body = intenção explícita (número troca,
    // null limpa). Ausente = não mexe. Quando setando um valor, valida.
    const mudaClasse = Object.prototype.hasOwnProperty.call(req.body, 'classe_id');
    if (mudaClasse && classe_id != null) {
      const erroClasse = await validaClasse(classe_id);
      if (erroClasse) return res.status(400).json({ error: true, message: erroClasse });
    }

    const data = {
      ...(mudaClasse ? { classe_id: classe_id != null ? Number(classe_id) : null } : {}),
      ...(marca_id != null ? { marca_id: Number(marca_id) } : {}),
      ...(produto != null ? { produto: String(produto).trim() } : {}),
      ...(modelo  != null ? { modelo:  String(modelo).trim() } : {}),
      ...(custo   != null ? { custo:   toMoneyStr(custo) } : {}),
      ...(valor_venda != null ? { valor_venda: toMoneyStr(valor_venda) } : {}),
      ...(valor_vista != null ? { valor_vista: valor_vista === '' ? null : toMoneyStr(valor_vista) } : {}),
      ...(valor_parcelado != null ? { valor_parcelado: valor_parcelado === '' ? null : toMoneyStr(valor_parcelado) } : {}),
      ...(percentual_lucro != null ? { percentual_lucro: toMoneyStr(percentual_lucro) } : {}),
      ...(qtd_minima != null ? { qtd_minima: toInt(qtd_minima, 0) } : {}),
      ...(garantia  != null ? { garantia: fmtGarantia(garantia) } : {}),
    };

    // qtd_inicial é o saldo de abertura — base de em_estoque (= qtd_inicial +
    // entradas − saidas). Só pode ser CORRIGIDA enquanto o produto não tiver
    // nenhuma movimentação; depois disso o ajuste tem que passar por uma
    // Entrada/Saída, senão o estoque exibido mudaria sem rastro de auditoria.
    if (qtd_inicial != null && toInt(qtd_inicial, existente.qtd_inicial) !== existente.qtd_inicial) {
      const temMovimentacao = (existente.entradas ?? 0) > 0 || (existente.saidas ?? 0) > 0;
      if (temMovimentacao) {
        return res.status(409).json({
          error: true,
          message: 'Não é possível alterar a Quantidade Inicial: o produto já tem movimentações. Ajuste o estoque com uma Entrada ou Saída.',
        });
      }
      data.qtd_inicial = toInt(qtd_inicial, existente.qtd_inicial);
    }

    const atualizado = await prisma.estoque_som.update({ where: { id }, data });
    res.json(atualizado);
  } catch (e) {
    console.error('PUT /api/estoque-som/:id ERRO:', e);
    next(e);
  }
});

/** DELETE /api/estoque-som/:id (com tratamento de FK) */
estoqueSomRouter.delete('/:id', requireAdmin, validate({ params: idParams }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.estoque_som.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    if (e?.code === 'P2003') {
      // FK constraint
      return res.status(409).json({
        error: true,
        message: 'Não é possível remover: existem movimentações vinculadas a este produto.',
      });
    }
    console.error('DELETE /api/estoque-som/:id ERRO:', e);
    next(e);
  }
});
