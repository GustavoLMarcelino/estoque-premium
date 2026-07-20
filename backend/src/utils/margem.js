// Trava anti-prejuízo do cadastro/edição de produto (regra de negócio: o
// backend REJEITA, o front só antecipa o aviso).
//
// Fonte das taxas: frontend/src/utils/precos.js — as MESMAS constantes que
// geram o preço sugerido na tela (TAXA_DEBITO 1,36% / TAXA_PARCELADO 12,75%),
// e não a taxas_config do banco. Motivo: gerador e trava precisam usar o
// número idêntico, senão a trava reprovaria o preço que a própria tela
// sugeriu; e esses valores são CONGELADOS em valor_vista/valor_parcelado ao
// salvar, então validar com eles é o que casa com o que fica gravado.
// (Hoje os dois bate: taxas_config = débito 1,36% e 7a12 2,76% + antecipação
// 10x 9,99% = 12,75%.) Import cross-boundary porque o deploy sobe o repo
// inteiro via git pull — mesmo caminho já usado pelos testes.
import { validarMargemMinima } from '../../../frontend/src/utils/precos.js';

// Prisma devolve Decimal em produção; String() antes de Number() é o coerce
// seguro para os dois schemas (MySQL Decimal e SQLite Float).
const n = (v) => (v == null || v === '' ? null : Number(String(v)));

const CAMPOS_PRECO = ['valor_venda', 'valor_vista', 'valor_parcelado'];

/** true quando o body é um save de produto que define preço (vs. o PUT
 *  parcial só-de-custo que o Lançamento de Entrada dispara). */
export function mexeEmPreco(body = {}) {
  return CAMPOS_PRECO.some((k) => Object.prototype.hasOwnProperty.call(body, k));
}

/** Confere o estado FINAL do produto (já mesclado, no caso do PUT).
 *  Retorna a mensagem de erro, ou null quando passa.
 *  valor_vista/valor_parcelado ausentes caem em valor_venda — é o mesmo
 *  fallback que as telas de venda usam, então é o preço que sairia de fato. */
export function checarMargemMinima({ custo, valor_venda, valor_vista, valor_parcelado }) {
  const venda = n(valor_venda) ?? 0;
  const { ok, message } = validarMargemMinima({
    custo: n(custo) ?? 0,
    valorVista: n(valor_vista) ?? venda,
    valorParcelado: n(valor_parcelado) ?? venda,
  });
  return ok ? null : message;
}
