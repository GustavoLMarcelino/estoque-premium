import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { validate, idParams } from "../middlewares/validate.js";
import { criarGarantiaBody, editarGarantiaBody } from "../schemas/garantias.schema.js";

export const garantiasRouter = Router();

/** em_estoque atual — coluna DERIVADA, nunca escrita pelo app.
 * Mesmo helper do inventário: usa o valor do banco se presente, senão calcula. */
const emEstoqueDe = (p) => {
  if (p?.em_estoque !== null && p?.em_estoque !== undefined) return p.em_estoque;
  return Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0);
};

/**
 * GET /api/garantias?q=&page=&pageSize=
 * Lista garantias com busca simples.
 */
garantiasRouter.get("/", async (req, res, next) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 50, 1), 200);

    const where = q
      ? {
          OR: [
            { cliente_nome: { contains: q } },
            { cliente_documento: { contains: q } },
            { cliente_telefone: { contains: q } },
            { produto_codigo: { contains: q } },
            { produto_descricao: { contains: q } },
          ],
        }
      : undefined;

    const [total, data] = await Promise.all([
      prisma.garantias.count({ where }),
      prisma.garantias.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({ page, pageSize, total, pages: Math.ceil(total / pageSize), data });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/garantias/:id
 */
garantiasRouter.get("/:id", validate({ params: idParams }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const g = await prisma.garantias.findUnique({ where: { id } });
    if (!g) return res.status(404).json({ error: true, message: "Garantia nao encontrada" });
    res.json(g);
  } catch (e) {
    next(e);
  }
});

/**
 * PATCH /api/garantias/:id
 * Atualiza dados basicos da garantia (cliente, produto, datas, status, descricao).
 */
garantiasRouter.patch("/:id", validate({ params: idParams, body: editarGarantiaBody }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existente = await prisma.garantias.findUnique({ where: { id } });
    if (!existente) return res.status(404).json({ error: true, message: "Garantia nao encontrada" });

    const { cliente, produto, garantia } = req.body || {};
    const data = { updated_at: new Date() };

    if (cliente) {
      if (!cliente?.nome || !cliente?.documento || !cliente?.telefone) {
        return res.status(400).json({ error: true, message: "Dados do cliente incompletos." });
      }
      data.cliente_nome = String(cliente.nome).trim();
      data.cliente_documento = String(cliente.documento).trim();
      data.cliente_telefone = String(cliente.telefone).trim();
      // endereco: só atualiza se enviado (mantém o valor existente no banco caso ausente)
      if (cliente.endereco !== undefined) data.cliente_endereco = String(cliente.endereco ?? "").trim();
    }

    if (produto) {
      if (!produto?.codigo || !produto?.descricao) {
        return res.status(400).json({ error: true, message: "Produto (codigo e descricao) e obrigatorio." });
      }
      const codigo = String(produto.codigo).trim();
      const descricao = String(produto.descricao).trim();
      data.produto_codigo = codigo;
      data.produto_descricao = descricao;

      const itemEstoque = await prisma.estoque.findFirst({
        where: {
          OR: [
            { modelo: codigo },
            { produto: codigo },
            { modelo: descricao },
            { produto: descricao },
          ],
        },
      });
      data.estoque_id = itemEstoque?.id ?? null;
    }

    if (garantia) {
      if (garantia.dataAbertura) data.data_abertura = new Date(garantia.dataAbertura);
      if (garantia.dataLimite !== undefined) data.data_limite = garantia.dataLimite ? new Date(garantia.dataLimite) : null;
      if (garantia.dataContato !== undefined) data.data_contato = garantia.dataContato ? new Date(garantia.dataContato) : null;
      if (garantia.dataCompra !== undefined) data.data_compra = garantia.dataCompra ? new Date(garantia.dataCompra) : null;
      if (garantia.status) data.status = garantia.status;
      if (garantia.descricaoProblema !== undefined) data.descricao_problema = garantia.descricaoProblema || null;
    }

    const atualizada = await prisma.garantias.update({ where: { id }, data });
    res.json(atualizada);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/garantias
 * body:
 * {
 *   cliente: { nome, documento, telefone, endereco },
 *   produto: { codigo, descricao },
 *   garantia: { dataAbertura?, dataLimite, dataCompra?, status?, descricaoProblema? },
 *   emprestimo?: { ativo: boolean, produtoCodigo?: string, quantidade?: number }
 * }
 */
garantiasRouter.post("/", validate({ body: criarGarantiaBody }), async (req, res, next) => {
  try {
    const { cliente, produto, garantia, emprestimo } = req.body || {};

    if (!cliente?.nome || !cliente?.documento || !cliente?.telefone) {
      return res.status(400).json({ error: true, message: "Dados do cliente incompletos." });
    }
    if (!produto?.codigo || !produto?.descricao) {
      return res.status(400).json({ error: true, message: "Produto (codigo e descricao) e obrigatorio." });
    }

    const codigo = String(produto.codigo).trim();
    const descricao = String(produto.descricao).trim();

    // tenta vincular a um item de estoque
    const itemEstoque = await prisma.estoque.findFirst({
      where: {
        OR: [
          { modelo: codigo },
          { produto: codigo },
          { modelo: descricao },
          { produto: descricao },
        ],
      },
    });

    const now = new Date();
    const dataAbertura = garantia?.dataAbertura ? new Date(garantia.dataAbertura) : now;
    const dataLimite = garantia?.dataLimite ? new Date(garantia.dataLimite) : null;
    const dataContato = garantia?.dataContato ? new Date(garantia.dataContato) : null;
    const dataCompra = garantia?.dataCompra ? new Date(garantia.dataCompra) : null;
    const status = garantia?.status || "ABERTA";

    const created = await prisma.$transaction(async (tx) => {
      const novaGarantia = await tx.garantias.create({
        data: {
          cliente_nome: String(cliente.nome).trim(),
          cliente_documento: String(cliente.documento).trim(),
          cliente_telefone: String(cliente.telefone).trim(),
          cliente_endereco: String(cliente.endereco ?? "").trim(),

          produto_codigo: codigo,
          produto_descricao: descricao,

          estoque_id: itemEstoque?.id ?? null,

          data_abertura: dataAbertura,
          data_limite: dataLimite,
          data_contato: dataContato,
          data_compra: dataCompra,

          status, // enum garantias_status
          descricao_problema: garantia?.descricaoProblema || null,

          created_at: now,
          updated_at: now,
        },
      });

      // Se houver emprestimo, registra SAIDA, atualiza agregados e PERSISTE o
      // empréstimo na garantia (produto + quantidade) para permitir a devolução.
      if (emprestimo?.ativo && itemEstoque?.id && Number(emprestimo?.quantidade) > 0) {
        const qtd = Number(emprestimo.quantidade);

        const est = await tx.estoque.findUnique({ where: { id: itemEstoque.id } });
        const emEstoque = Number(emEstoqueDe(est));
        if (qtd > emEstoque) {
          const err = new Error(`Sem estoque suficiente para emprestimo. Atual: ${emEstoque}`);
          err.statusCode = 400;
          throw err;
        }

        await tx.movimentacoes.create({
          data: {
            produto_id: itemEstoque.id,
            tipo: "SAIDA",
            quantidade: qtd,
            valor_final: 0,
            data_movimentacao: new Date(),
            motivo: `Empréstimo garantia #${novaGarantia.id}`,
            garantia_id: novaGarantia.id,
          },
        });

        // Apenas incrementa saidas — em_estoque é derivada (qtd_inicial +
        // entradas − saidas) e não deve ser escrita: um valor não-nulo aqui
        // congelaria o estoque exibido em todos os pontos de leitura.
        await tx.estoque.update({
          where: { id: itemEstoque.id },
          data: { saidas: (est.saidas ?? 0) + qtd },
        });

        // Retorna a garantia já com os campos de empréstimo preenchidos.
        return tx.garantias.update({
          where: { id: novaGarantia.id },
          data: { emprestimo_produto_id: itemEstoque.id, emprestimo_quantidade: qtd, emprestimo_devolvido: false },
        });
      }

      return novaGarantia;
    });

    res.status(201).json(created);
  } catch (e) {
    if (e?.statusCode) return res.status(e.statusCode).json({ error: true, message: e.message });
    next(e);
  }
});

/**
 * PATCH /api/garantias/:id/devolver
 * Encerra o empréstimo: reverte a baixa de estoque (ENTRADA ligada à garantia)
 * e marca como devolvido. Idempotência protegida — não devolve 2×. Qualquer
 * autenticado (mesma régua da criação da garantia e das movimentações).
 */
garantiasRouter.patch("/:id/devolver", validate({ params: idParams }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const g = await prisma.garantias.findUnique({ where: { id } });
    if (!g) return res.status(404).json({ error: true, message: "Garantia não encontrada." });

    if (!g.emprestimo_produto_id || !(Number(g.emprestimo_quantidade) > 0)) {
      return res.status(400).json({ error: true, message: "Esta garantia não tem empréstimo ativo." });
    }
    if (g.emprestimo_devolvido) {
      return res.status(400).json({ error: true, message: "Empréstimo já devolvido." });
    }

    const qtd = Number(g.emprestimo_quantidade);
    const atualizada = await prisma.$transaction(async (tx) => {
      const prod = await tx.estoque.findUnique({ where: { id: g.emprestimo_produto_id } });
      if (prod) {
        await tx.movimentacoes.create({
          data: {
            produto_id: g.emprestimo_produto_id,
            tipo: "ENTRADA",
            quantidade: qtd,
            valor_final: 0,
            data_movimentacao: new Date(),
            motivo: `Devolução empréstimo garantia #${id}`,
            garantia_id: id,
          },
        });
        // Reverte a baixa: em_estoque é derivada, então basta reduzir 'saidas'.
        await tx.estoque.update({
          where: { id: g.emprestimo_produto_id },
          data: { saidas: Math.max(0, (prod.saidas ?? 0) - qtd) },
        });
      }
      return tx.garantias.update({
        where: { id },
        data: { emprestimo_devolvido: true, emprestimo_devolvido_at: new Date(), updated_at: new Date() },
      });
    });

    res.json({ error: false, message: "Empréstimo devolvido ao estoque.", data: atualizada });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /api/garantias/:id (LGPD — exclusão completa)
 * Apenas admin.
 */
garantiasRouter.delete("/:id", requireAuth, requireAdmin, validate({ params: idParams }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.garantias.delete({ where: { id } });
    res.json({ error: false, message: "Garantia excluída com sucesso." });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/garantias/:id/anonimizar (LGPD — direito ao esquecimento)
 * Mantém o histórico da garantia, mas remove a PII do cliente. Apenas admin.
 */
garantiasRouter.post("/:id/anonimizar", requireAuth, requireAdmin, validate({ params: idParams }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const anonimizado = await prisma.garantias.update({
      where: { id },
      data: {
        cliente_nome: "ANONIMIZADO",
        cliente_documento: "ANONIMIZADO",
        cliente_telefone: "ANONIMIZADO",
        cliente_endereco: "ANONIMIZADO",
      },
    });
    res.json({ error: false, message: "Dados do cliente anonimizados.", data: anonimizado });
  } catch (e) {
    next(e);
  }
});
