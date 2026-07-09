-- Migração manual (produção MySQL/RDS): Classe de serviço no Estoque Som.
-- Rodar ANTES do deploy do código que usa classe_som / classe_id.
--
-- Uma classe carrega um valor fixo de mão de obra, somado no Orçamento e na
-- Tabela de Preços (aba Som). Só afeta o SOM — Baterias não muda.
--
-- SEGURANÇA COM DADOS EXISTENTES:
--   - classe_id em estoque_som é NULLABLE — as linhas de produto de som já
--     existentes ficam com classe_id NULL (sem classe), sem exigir backfill.
--   - classe_som é tabela nova; os 10 INSERTs abaixo são o seed inicial
--     (produção não roda o seed.js). Rodar UMA vez.

-- 1) Tabela de classes de som
CREATE TABLE classe_som (
  id INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(80) NOT NULL,
  valor_mao_obra DECIMAL(10,2) NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY classe_som_nome_key (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Seed inicial — 10 classes (valores de mão de obra atuais)
INSERT INTO classe_som (nome, valor_mao_obra) VALUES
  ('Mídia',          150.00),
  ('Câmera',         100.00),
  ('Autofalante',     60.00),
  ('Sensor de ré',   150.00),
  ('Alarme',         200.00),
  ('Anti-furto',      80.00),
  ('Vidro',           50.00),
  ('Rádio',           50.00),
  ('Trava 2 portas', 150.00),
  ('Trava 4 portas', 200.00);

-- 3) FK NULLABLE em estoque_som (tabela pode ter dados — classe_id fica NULL)
ALTER TABLE estoque_som
  ADD COLUMN classe_id INT NULL AFTER marca_id,
  ADD INDEX idx_estoque_som_classe (classe_id),
  ADD CONSTRAINT fk_estoque_som_classe FOREIGN KEY (classe_id) REFERENCES classe_som(id)
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ───────────────────────── CONFERÊNCIA ─────────────────────────
-- As 10 classes entraram certinho (deve retornar 10, e os valores da lista):
--   SELECT COUNT(*) AS total_classes FROM classe_som;                  -- = 10
--   SELECT id, nome, valor_mao_obra, ativo FROM classe_som ORDER BY id;
-- Estrutura nova:
--   SHOW CREATE TABLE classe_som;      -- unique classe_som_nome_key, decimal(10,2)
--   SHOW CREATE TABLE estoque_som;     -- coluna classe_id + fk_estoque_som_classe
-- Produtos de som existentes seguem sem classe (esperado):
--   SELECT COUNT(*) AS som_sem_classe FROM estoque_som WHERE classe_id IS NULL;
