-- Migração manual (produção MySQL/RDS): forma de pagamento + parcelas na
-- movimentação e config de taxas de maquininha no banco.
-- Rodar ANTES do deploy do código (o push só vem depois da sua confirmação).
-- Pareada com a migration Prisma 20260717181249_add_forma_pagamento_taxas_config (SQLite dev).
--
-- Contexto: forma_pagamento/parcelas e as taxas viviam no localStorage do
-- navegador — invisíveis entre usuários. Agora vão para o banco, e o
-- /movimentacoes/resumo calcula taxa e lucro líquido no servidor.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Colunas de venda em movimentacoes (baterias). NULL = não informado.
--    forma_pagamento: dinheiro | pix | debito | credito. parcelas só no crédito.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE movimentacoes
  ADD COLUMN forma_pagamento VARCHAR(20) NULL AFTER vendedor,
  ADD COLUMN parcelas        INT         NULL AFTER forma_pagamento;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Config de taxas (singleton). Percentuais 0–100 (ex.: 1.36 = 1,36%).
--    O app cria a linha sozinho no 1º acesso se não existir; o INSERT abaixo
--    apenas garante os valores confirmados de forma determinística.
--    Valores: Plano Essencial, Visa/Master, pior caso.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taxas_config (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  pix_pct             DECIMAL(5,2) NOT NULL,
  debito_pct          DECIMAL(5,2) NOT NULL,
  credito_avista_pct  DECIMAL(5,2) NOT NULL,
  credito_2a6_pct     DECIMAL(5,2) NOT NULL,
  credito_7a12_pct    DECIMAL(5,2) NOT NULL,
  antecipacao_mes_pct DECIMAL(5,2) NOT NULL,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by          VARCHAR(120) NULL
);

INSERT INTO taxas_config
  (pix_pct, debito_pct, credito_avista_pct, credito_2a6_pct, credito_7a12_pct, antecipacao_mes_pct)
SELECT 0.50, 1.36, 3.43, 2.36, 2.76, 1.96
WHERE NOT EXISTS (SELECT 1 FROM taxas_config);

-- Sem backfill de histórico: no momento desta migração não havia produtos nem
-- movimentações cadastrados. Vendas futuras já nascem com forma_pagamento.

-- Conferência final:
-- SELECT id, tipo, valor_final, forma_pagamento, parcelas FROM movimentacoes
--   WHERE tipo='SAIDA' ORDER BY id DESC LIMIT 20;
-- SELECT * FROM taxas_config;
