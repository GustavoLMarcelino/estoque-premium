-- Migração manual para PRODUÇÃO (RDS / MySQL) — Estoque Premium
-- PARTE 2 de 2 — DESTRUTIVA. Remove o catálogo classe_som e os vínculos de FK.
-- Rodar UMA vez. Faça snapshot do RDS antes.
--
-- ⚠️ PRÉ-REQUISITOS — os três, nesta ordem, sem exceção:
--   1. A PARTE 1 (2026-08-17-classe-som-parte1-percentual-item.sql) rodou e as
--      conferências do passo 5 dela passaram. É lá que a % de cada item foi
--      congelada; sem isso, o DROP abaixo apaga a única fonte da categoria e a
--      comissão do histórico fica sem como ser re-derivada.
--   2. O CÓDIGO NOVO ESTÁ EM PRODUÇÃO. Este arquivo NÃO convive com o código
--      antigo: o Prisma Client publicado lista classe_id explicitamente nos
--      SELECTs de pedido_som_item. No instante em que a coluna some, quebram
--      GET /api/pedido-som, POST /api/pedido-som e GET /api/classes-som — ou
--      seja, o módulo de Som inteiro. Foi exatamente por isso que
--      2026-07-31-remove-classe-som.sql se limitou a DML.
--   3. Nenhum item ficou com percentual_comissao NULL (conferência (a) da parte 1).
--
-- Reversão: não há. As colunas e a tabela somem. O que garante o histórico é o
-- backfill da parte 1, já gravado em pedido_som_item.percentual_comissao e em
-- comissao_periodo_item.snap_percentual_efetivo.

-- ---------------------------------------------------------------------------
-- CONFERIR ANTES (esperado: faltando = 0). Não siga se vier diferente.
-- ---------------------------------------------------------------------------
-- SELECT COUNT(*) AS faltando FROM pedido_som_item
--  WHERE mao_obra_total IS NOT NULL AND mao_obra_total > 0
--    AND percentual_comissao IS NULL;

-- ---------------------------------------------------------------------------
-- DROPS — FK antes do índice, índice antes da coluna (exigência do MySQL:
-- a coluna não sai enquanto houver FK, e o índice da FK não cai sozinho).
-- ---------------------------------------------------------------------------
ALTER TABLE pedido_som_item DROP FOREIGN KEY fk_pedido_som_item_classe;
ALTER TABLE pedido_som_item DROP INDEX       idx_pedido_som_item_classe;
ALTER TABLE pedido_som_item DROP COLUMN      classe_id;

ALTER TABLE estoque_som     DROP FOREIGN KEY fk_estoque_som_classe;
ALTER TABLE estoque_som     DROP INDEX       idx_estoque_som_classe;
ALTER TABLE estoque_som     DROP COLUMN      classe_id;

DROP TABLE classe_som;

-- ---------------------------------------------------------------------------
-- CONFERIR DEPOIS
-- ---------------------------------------------------------------------------
-- SHOW COLUMNS FROM pedido_som_item LIKE 'classe_id';   -- esperado: vazio
-- SHOW COLUMNS FROM estoque_som     LIKE 'classe_id';   -- esperado: vazio
-- SHOW TABLES LIKE 'classe_som';                        -- esperado: vazio
-- SELECT COUNT(*) AS itens, SUM(percentual_comissao IS NOT NULL) AS com_pct
--   FROM pedido_som_item;
