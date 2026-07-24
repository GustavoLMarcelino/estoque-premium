// Normalização de texto para busca/comparação acento-insensível.
// NFD decompõe cada letra acentuada em letra-base + diacrítico combinante; o
// replace remove os combinantes (faixa U+0300–U+036F); toLowerCase iguala a
// caixa. Assim "Câmera de Ré" e "camera de re" viram a mesma string.
// Fonte ÚNICA dessa regra no front — reusada pela busca do Estoque, do
// Orçamento e pela detecção de forma de pagamento em precos.js.
export function semAcento(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
