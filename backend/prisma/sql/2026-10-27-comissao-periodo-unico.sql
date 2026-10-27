-- Migração manual para PRODUÇÃO (RDS / MySQL) — Estoque Premium
-- Torna comissao_periodo.data_inicio ÚNICO (um snapshot por quinzena) e
-- aposenta o índice comum idx_comissao_periodo_inicio, que o único substitui.
--
-- POR QUE: o fechamento preguiçoso (GET /api/comissao/painel) faz findFirst e
-- depois create. Dois acessos simultâneos liam "não existe" os dois e gravavam
-- o mesmo período duas vezes, com os itens (vendedores) em dobro. A chave lógica
-- é só data_inicio: a tabela não tem coluna de linha, escopo ou usuário.
--
-- PRÉ-VOO (já conferido em 27/10/2026: 5 períodos, 0 duplicatas):
--   SELECT data_inicio, COUNT(*) FROM comissao_periodo GROUP BY data_inicio HAVING COUNT(*) > 1;
-- Se houver duplicata o ALTER falha INTEIRO e nada muda. Tabela de 5 linhas:
-- o ALTER é imediato. O DDL no MySQL faz commit implícito; não existe ROLLBACK.
--
-- ORDEM: aplicar ESTE SQL antes do push do código. O código novo funciona com
-- ou sem o índice; o inverso (SQL depois) deixa a janela de corrida aberta.
--
-- Reverter (se preciso):
--   ALTER TABLE comissao_periodo
--     ADD INDEX idx_comissao_periodo_inicio (data_inicio),
--     DROP INDEX uq_comissao_periodo_inicio;

ALTER TABLE comissao_periodo
  ADD UNIQUE INDEX uq_comissao_periodo_inicio (data_inicio),
  DROP INDEX idx_comissao_periodo_inicio;
