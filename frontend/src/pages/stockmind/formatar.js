// A demanda por grupo vem repartida entre subgrupos, então pode ser fracionária.
export function formatarDemanda(valor) {
  if (valor == null) return '—';
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace('.', ',');
}

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatarMoeda(valor) {
  return valor == null ? '—' : MOEDA.format(valor);
}

export function formatarDias(dias) {
  if (dias == null) return '—';
  return `${dias.toLocaleString('pt-BR')} ${dias === 1 ? 'dia' : 'dias'}`;
}

// 'AAAA-MM-DD' -> 'DD/MM/AAAA' sem passar por Date (evita o deslocamento de fuso).
export function formatarData(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
