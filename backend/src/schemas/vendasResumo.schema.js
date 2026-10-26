import { z } from 'zod';
import { inicioDoDiaBRT, fimDoDiaBRT } from '../utils/fusoBrasilia.js';

// Período opcional do GET /api/vendas-resumo.
//
// Ausentes = agrega TUDO, que é o comportamento histórico: o Dashboard e o
// /movimentacoes/resumo dependem disso e não passam nada.

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;
// ISO 8601: a data, e daí em diante o horário. Só o começo é conferido aqui —
// o resto fica com o Date, que rejeita hora impossível.
const ISO = /^\d{4}-\d{2}-\d{2}[T ]/;

/** 'YYYY-MM-DD' ou ISO 8601 → Date. null quando não dá para interpretar.
 *
 *  O formato é EXIGIDO, não adivinhado. `new Date()` sozinho aceita
 *  '10/08/2026' e resolve como 8 de outubro, no formato americano — quem
 *  digitasse 10 de agosto receberia outro mês sem um único aviso, e um resumo
 *  de período errado é indistinguível de um certo. Fora do contrato, 400.
 *
 *  Data pura é o dia de BRASÍLIA (00:00 a 23:59:59.999 BRT, convertidos para
 *  UTC), e o fim é o ÚLTIMO instante do dia: `to=2026-08-04` tem que incluir
 *  as vendas daquele dia inteiro, senão pedir "até hoje" devolveria hoje
 *  vazio. É o mesmo corte de diaDe() na série por dia e do Registro do Som,
 *  então card, gráfico e Registro nunca discordam na virada do dia. Quem
 *  precisa de um instante exato manda ISO completo e contorna a questão. */
function parseData(s, fimDoDia) {
  if (SO_DATA.test(s)) {
    const d = fimDoDia ? fimDoDiaBRT(s) : inicioDoDiaBRT(s);
    return Number.isNaN(d.getTime()) ? null : d; // pega 2026-13-45
  }
  if (!ISO.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const campoData = (fimDoDia) =>
  z
    .string()
    .trim()
    .refine((s) => parseData(s, fimDoDia) !== null, {
      message: 'data inválida — use YYYY-MM-DD ou ISO 8601',
    })
    .transform((s) => parseData(s, fimDoDia))
    .optional();

/** .strict() pelo mesmo motivo do editarPedidoBody: sem ele, `?form=...` (em
 *  vez de `from`) seria descartado em silêncio e devolveria o resumo de TODO o
 *  histórico com cara de resumo da semana — exatamente a classe de erro mudo
 *  que este endpoint existe para acabar. */
export const resumoPeriodoQuery = z
  .object({
    from: campoData(false),
    to: campoData(true),
  })
  .strict()
  .refine((q) => !(q.from && q.to) || q.from <= q.to, {
    message: 'from não pode ser depois de to',
    path: ['from'],
  });
