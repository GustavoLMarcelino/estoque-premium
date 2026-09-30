-- Migração manual (produção MySQL/RDS): fila de conferência de vendas.
-- Rodar ANTES do deploy do código (o push só vem depois da sua confirmação).
--
-- Toda venda (SAIDA) lançada por usuário não-admin nasce "pendente" até um
-- admin conferir contra o extrato do banco. Admin lança direto sem fila —
-- ele já é quem confere, não faz sentido conferir a si mesmo.
--
-- ─────────────────────────────────────────────────────────────────────────
-- status_verificacao: NULL = não entra na fila (venda de admin, ou não é
-- SAIDA). 'pendente' = aguardando conferência. 'conferido' = já bateu com o
-- extrato. VARCHAR livre (não ENUM) por paridade com status_pagamento textual
-- de outras colunas da tabela e para não exigir migração de schema se um
-- terceiro estado aparecer depois.
--
-- data_verificacao / verificado_por_user_id / verificado_por: preenchidos
-- juntos, no momento da conferência. verificado_por guarda o e-mail/nome
-- como texto solto (mesmo padrão de created_by) para o registro sobreviver
-- mesmo se o usuário for removido depois; verificado_por_user_id é o vínculo
-- forte, sem FK (mesmo padrão de user_id/created_by já usados nesta tabela).
--
-- Sem backfill: linhas existentes ficam com os 4 campos NULL (nunca entraram
-- na fila, criada agora). Sem DEFAULT em status_verificacao — o valor é
-- decidido pelo código no POST, não pelo banco.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE movimentacoes
  ADD COLUMN status_verificacao VARCHAR(20) NULL AFTER cliente_fiado,
  ADD COLUMN data_verificacao DATETIME NULL AFTER status_verificacao,
  ADD COLUMN verificado_por_user_id INT NULL AFTER data_verificacao,
  ADD COLUMN verificado_por VARCHAR(191) NULL AFTER verificado_por_user_id,
  ADD INDEX idx_mov_status_verificacao (status_verificacao);

-- Conferência final:
-- SHOW COLUMNS FROM movimentacoes
--   WHERE Field IN ('status_verificacao','data_verificacao',
--                   'verificado_por_user_id','verificado_por');
--   → esperado: status_verificacao varchar(20) YES NULL
--               data_verificacao   datetime    YES NULL
--               verificado_por_user_id int      YES NULL
--               verificado_por      varchar(191) YES NULL
-- SELECT COUNT(*) FROM movimentacoes WHERE status_verificacao IS NOT NULL;
--   → esperado: 0
-- SHOW INDEX FROM movimentacoes WHERE Key_name = 'idx_mov_status_verificacao';
--   → esperado: 1 linha, Column_name = status_verificacao
