-- Migração manual (produção MySQL/RDS): nº de parcelas no pedido de Som.
-- Rodar ANTES do deploy do código (o push só vem depois da sua confirmação).
-- Pareada com a migration Prisma 20260803120000_add_parcelas_pedido_som (SQLite dev).
--
-- Contexto: o pedido de Som perguntava só "Parcelado ou À Vista" — um toggle
-- cosmético que trocava o rótulo salvo e nada mais. O nº real de parcelas nunca
-- era capturado. Ele importa DUAS vezes na taxa da maquininha: define a faixa de
-- intermediação (2x–6x = 2,36% vs 7x–10x = 2,76%) e compõe a antecipação por
-- parcela (desconto composto a valor presente). Agora o Som captura o número,
-- como a Venda Simples de Baterias já faz em movimentacoes.parcelas.
--
-- NÃO afeta preço nem total: crédito segue usando o valor_parcelado do produto
-- em qualquer nº de parcelas (regra única com Baterias). A coluna é o insumo
-- auditável da apuração de taxa de Som, que ainda NÃO é calculada.

-- ─────────────────────────────────────────────────────────────────────────
-- parcelas em pedido_som. NULL = não informado (ou forma sem parcelamento).
-- Mesmo formato de movimentacoes.parcelas (Baterias): INT NULL, 1–10.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE pedido_som ADD COLUMN parcelas INT NULL AFTER forma_pagamento;

-- Sem backfill: pedidos já lançados ficam com parcelas NULL de propósito —
-- o nº de parcelas deles não existe em lugar nenhum e inventar um valor
-- (1x? 10x?) contaminaria o histórico. Pedidos futuros já nascem com o dado.

-- Conferência final:
-- SELECT id, valor_total, forma_pagamento, parcelas FROM pedido_som
--   ORDER BY id DESC LIMIT 20;
