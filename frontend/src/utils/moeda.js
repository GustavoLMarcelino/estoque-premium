const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 1.234,50". Valor ausente ou não numérico vira R$ 0,00. */
export const fmtBRL = (n) => BRL.format(Number(n) || 0);
