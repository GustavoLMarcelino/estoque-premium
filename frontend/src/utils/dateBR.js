// Helpers de data dd/mm/aaaa <-> ISO (yyyy-mm-dd). Trabalham só com strings:
// passar por new Date("yyyy-mm-dd") interpreta como UTC e, no Brasil (UTC-3),
// a data apareceria um dia antes.

/** Aplica a máscara dd/mm/aaaa a qualquer texto digitado (ignora o que não é dígito). */
export function maskDateBR(v = "") {
  const d = String(v).replace(/\D+/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "dd/mm/aaaa" -> "yyyy-mm-dd"; "" se incompleta ou se a data não existe (31/02, 29/02 em ano comum). */
export function brToIso(br = "") {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br));
  if (!m) return "";
  const dia = Number(m[1]), mes = Number(m[2]), ano = Number(m[3]);
  if (ano < 1900 || ano > 2100) return "";
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "yyyy-mm-dd" (ou ISO completo "yyyy-mm-ddT...") -> "dd/mm/aaaa"; "" se inválido. */
export function isoToBr(iso = "") {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
