// Comparador genérico de células de tabela (sort do estoque e afins).
// Regras EXPLÍCITAS, aplicadas nesta ordem — nada depende de coerção implícita
// (o velho String(null)→"" ordenava null só por acidente do char vazio):
//   1. Nulos/indefinidos SEMPRE por último, em qualquer direção (asc e desc).
//      Ambos nulos → empate. Isso mantém a simetria compare(a,b) = −compare(b,a)
//      inclusive contra números negativos (compare(-50, null) e compare(null,
//      -50) têm sinais opostos), sem cair no ramo numérico com um lado null.
//   2. Dois números → ordem numérica (respeita negativos e magnitude, nunca
//      alfabética: 9 < 100, 1000 > 555).
//   3. Caso geral → comparação de string, case-insensitive.
// Retorno segue o contrato de Array.prototype.sort (negativo / 0 / positivo).
export function compararValores(va, vb, dir = "asc") {
  const na = va == null; // == pega null E undefined
  const nb = vb == null;
  if (na || nb) return na === nb ? 0 : na ? 1 : -1; // null ao fim, independe de dir

  if (typeof va === "number" && typeof vb === "number") {
    return dir === "asc" ? va - vb : vb - va;
  }

  const sa = String(va).toLowerCase();
  const sb = String(vb).toLowerCase();
  if (sa < sb) return dir === "asc" ? -1 : 1;
  if (sa > sb) return dir === "asc" ? 1 : -1;
  return 0;
}
