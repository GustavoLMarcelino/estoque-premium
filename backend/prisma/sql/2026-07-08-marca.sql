-- Migração manual (produção MySQL/RDS): campo Marca nos produtos.
-- Rodar ANTES do deploy do código que usa marca_id (coluna obrigatória).
-- Pré-condição: tabelas estoque e estoque_som VAZIAS (banco de produtos limpo).

-- 1) Tabela de marcas
CREATE TABLE marca (
  id INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(80) NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY marca_nome_key (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Marcas iniciais
INSERT INTO marca (nome) VALUES ('Acdelco'), ('Moura');

-- 3) FK obrigatória nos dois estoques (tabelas vazias — sem UPDATE de dados)
ALTER TABLE estoque
  ADD COLUMN marca_id INT NOT NULL AFTER modelo,
  ADD INDEX idx_estoque_marca (marca_id),
  ADD CONSTRAINT fk_estoque_marca FOREIGN KEY (marca_id) REFERENCES marca(id)
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE estoque_som
  ADD COLUMN marca_id INT NOT NULL AFTER modelo,
  ADD INDEX idx_estoque_som_marca (marca_id),
  ADD CONSTRAINT fk_estoque_som_marca FOREIGN KEY (marca_id) REFERENCES marca(id)
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Conferência:
-- SELECT * FROM marca;
-- SHOW CREATE TABLE estoque;
-- SHOW CREATE TABLE estoque_som;
