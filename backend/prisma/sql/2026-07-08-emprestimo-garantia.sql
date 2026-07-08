-- Migração manual (produção MySQL/RDS): rastreio e devolução de empréstimo
-- de garantia. Rodar ANTES do deploy do código que usa estes campos.
--
-- SEGURANÇA COM DADOS EXISTENTES: a tabela `garantias` NÃO está vazia em
-- produção. Todos os 4 ADD COLUMN abaixo são NULLABLE ou têm DEFAULT — nenhum
-- exige valor obrigatório para as linhas já existentes. Portanto:
--   - emprestimo_produto_id   INT NULL          -> linhas atuais ficam NULL
--   - emprestimo_quantidade   INT NULL          -> linhas atuais ficam NULL
--   - emprestimo_devolvido    TINYINT NOT NULL DEFAULT 0 -> linhas atuais = 0
--   - emprestimo_devolvido_at DATETIME NULL      -> linhas atuais ficam NULL
-- Não há backfill: garantias antigas com empréstimo não rastreado responderão
-- "sem empréstimo ativo" na devolução, que é o comportamento correto.

ALTER TABLE garantias
  ADD COLUMN emprestimo_produto_id   INT NULL           AFTER descricao_problema,
  ADD COLUMN emprestimo_quantidade   INT NULL           AFTER emprestimo_produto_id,
  ADD COLUMN emprestimo_devolvido    TINYINT(1) NOT NULL DEFAULT 0 AFTER emprestimo_quantidade,
  ADD COLUMN emprestimo_devolvido_at DATETIME(0) NULL   AFTER emprestimo_devolvido;

-- Conferência:
-- SHOW CREATE TABLE garantias;            -- confere as 4 colunas novas
-- SELECT COUNT(*) AS total,
--        SUM(emprestimo_devolvido = 0) AS nao_devolvidos
--   FROM garantias;                       -- todas as linhas antigas = 0 (default), sem erro
