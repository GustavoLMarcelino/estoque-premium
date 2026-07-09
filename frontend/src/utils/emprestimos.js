// Tempo decorrido desde que a bateria foi emprestada (data da SAÍDA de ida).
export function tempoEmprestada(desde) {
  if (!desde) return "—";
  const ms = Date.now() - new Date(desde).getTime();
  if (Number.isNaN(ms)) return "—";
  const dias = Math.floor(ms / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "1 dia";
  return `${dias} dias`;
}
