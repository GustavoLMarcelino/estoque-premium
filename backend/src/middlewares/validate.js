import { z } from 'zod';

/** Traduz o essencial do issue do Zod: campo + o que era esperado, sem vazar internals. */
function descreve(issue) {
  switch (issue.code) {
    case 'invalid_type': {
      // v3 expõe `received`; v4 só na mensagem ("... received NaN")
      const recebido = issue.received ?? /received (\S+)$/.exec(issue.message || '')?.[1];
      return recebido === 'undefined'
        ? 'campo obrigatório'
        : `tipo inválido (esperado ${issue.expected}${recebido ? `, recebido ${recebido}` : ''})`;
    }
    case 'invalid_enum_value': // zod v3
    case 'invalid_value': {    // zod v4
      const opcoes = (issue.options ?? issue.values ?? []).filter(Boolean);
      return opcoes.length ? `valor inválido — use: ${opcoes.join(', ')}` : 'valor inválido';
    }
    case 'too_small':
      return issue.type === 'array' || issue.origin === 'array'
        ? `mínimo de ${issue.minimum} item(ns)`
        : `valor/tamanho abaixo do mínimo (${issue.minimum})`;
    case 'too_big':
      return `valor/tamanho acima do máximo (${issue.maximum})`;
    default:
      return issue.message;
  }
}

/**
 * Middleware genérico de validação.
 * Uso: validate({ params: schemaZod, body: schemaZod, query: schemaZod })
 * — valida cada alvo informado; em falha responde 400 listando campo + problema;
 * em sucesso substitui o alvo pelos dados parseados (com coerções aplicadas).
 */
export function validate(schemas) {
  return (req, res, next) => {
    const erros = [];
    for (const alvo of ['params', 'query', 'body']) {
      const schema = schemas[alvo];
      if (!schema) continue;
      const r = schema.safeParse(req[alvo] ?? {});
      if (r.success) {
        req[alvo] = r.data;
      } else {
        for (const issue of r.error.issues) {
          const campo = [alvo, ...issue.path].join('.');
          erros.push(`${campo}: ${descreve(issue)}`);
        }
      }
    }
    if (erros.length) {
      return res.status(400).json({ error: true, message: `Dados inválidos — ${erros.join('; ')}` });
    }
    next();
  };
}

/** Params numéricos (ex.: :id) — rejeita com 400 antes de virar NaN no Prisma. */
export const paramsNumericos = (...nomes) =>
  z.object(Object.fromEntries(nomes.map((n) => [n, z.coerce.number().int().positive()])));

/** Caso mais comum: rota com :id numérico. */
export const idParams = paramsNumericos('id');
