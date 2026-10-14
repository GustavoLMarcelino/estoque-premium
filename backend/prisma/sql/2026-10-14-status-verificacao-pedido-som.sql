-- Migração manual (produção MySQL/RDS): fila de conferência dos pedidos de Som.
-- Rodar ANTES do deploy do código (o push só vem depois da sua confirmação).
--
-- Espelha 2026-09-29-status-verificacao-movimentacoes.sql, que cobriu só
-- Baterias. Todo pedido de Som lançado por usuário não-admin nasce "pendente"
-- até um admin conferir contra o extrato do banco; pedido de admin fica NULL.
--
-- status_verificacao: NULL = fora da fila; 'pendente'; 'conferido'.
-- data_verificacao / verificado_por_user_id / verificado_por: preenchidos
-- juntos na conferência (mesmo padrão de movimentacoes, sem FK).
--
-- Sem backfill: pedidos existentes ficam com os 4 campos NULL (nunca entraram
-- na fila). Sem DEFAULT — o valor é decidido pelo código no POST.
--
-- ─────────────────────────────────────────────────────────────────────────
-- GUARDS (information_schema), decididos ANTES do ALTER:
--   nenhuma das 4 colunas e nenhum índice  → aplica o ALTER
--   as 4 colunas e o índice já existem     → no-op (rodar de novo é seguro)
--   qualquer outro estado (parcial)        → ABORTA com erro, sem tocar na tabela
--
-- Precisa rodar numa ÚNICA sessão (mysql CLI / Workbench), porque o guard usa
-- variáveis de sessão (@...) e PREPARE. O "aborto" é uma consulta a uma tabela
-- inexistente cujo nome diz o motivo: o cliente mostra o erro e, no mysql CLI,
-- para o script.
-- ─────────────────────────────────────────────────────────────────────────
SET @tem_colunas = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedido_som'
     AND COLUMN_NAME IN ('status_verificacao', 'data_verificacao',
                         'verificado_por_user_id', 'verificado_por')
);
SET @tem_indice = (
  SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedido_som'
     AND INDEX_NAME = 'idx_pedido_som_status_verificacao'
);
SET @existe_tabela = (
  SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedido_som'
);

SET @stmt = CASE
  WHEN @existe_tabela = 0
    THEN 'SELECT 1 FROM ABORTA_tabela_pedido_som_nao_existe'
  WHEN @tem_colunas = 0 AND @tem_indice = 0
    THEN 'ALTER TABLE pedido_som ADD COLUMN status_verificacao VARCHAR(20) NULL AFTER created_at, ADD COLUMN data_verificacao DATETIME NULL AFTER status_verificacao, ADD COLUMN verificado_por_user_id INT NULL AFTER data_verificacao, ADD COLUMN verificado_por VARCHAR(191) NULL AFTER verificado_por_user_id, ADD INDEX idx_pedido_som_status_verificacao (status_verificacao)'
  WHEN @tem_colunas = 4 AND @tem_indice = 1
    THEN 'DO 0'
  ELSE 'SELECT 1 FROM ABORTA_estado_parcial_em_pedido_som_confira_colunas_e_indice'
END;

PREPARE passo FROM @stmt;
EXECUTE passo;
DEALLOCATE PREPARE passo;

-- Conferência final:
-- SHOW COLUMNS FROM pedido_som
--   WHERE Field IN ('status_verificacao','data_verificacao',
--                   'verificado_por_user_id','verificado_por');
--   → esperado: status_verificacao varchar(20) YES NULL
--               data_verificacao   datetime    YES NULL
--               verificado_por_user_id int      YES NULL
--               verificado_por      varchar(191) YES NULL
-- SELECT COUNT(*) FROM pedido_som WHERE status_verificacao IS NOT NULL;
--   → esperado: 0
-- SHOW INDEX FROM pedido_som WHERE Key_name = 'idx_pedido_som_status_verificacao';
--   → esperado: 1 linha, Column_name = status_verificacao
