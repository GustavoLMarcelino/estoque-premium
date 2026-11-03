// A demanda por grupo vem repartida entre subgrupos, então pode ser fracionária.
export function formatarDemanda(valor) {
  if (valor == null) return '—';
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace('.', ',');
}
