-- Migração manual para PRODUÇÃO (RDS / MySQL) — Estoque Premium
-- Rodar UMA vez, na ordem abaixo, ANTES de subir o código das Partes A e B.
-- Faça um snapshot do RDS antes de executar.
--
-- Cobre:
--   Parte A — colunas de mão de obra por classe em `pedido_som_item`
--   Parte B — tabelas de comissão (config + histórico quinzenal)
--
-- DDL gerado a partir de `prisma migrate diff` sobre schema.mysql.prisma
-- (mesmos tipos/índices/constraints que o Prisma aplicaria).

-- ============================================================
-- Parte A: pedido_som_item — mão de obra itemizada por classe
-- ============================================================
ALTER TABLE `pedido_som_item`
  ADD COLUMN `classe_id`      INTEGER       NULL,
  ADD COLUMN `mao_obra_unit`  DECIMAL(10, 2) NULL,
  ADD COLUMN `mao_obra_total` DECIMAL(10, 2) NULL;

CREATE INDEX `idx_pedido_som_item_classe` ON `pedido_som_item`(`classe_id`);

ALTER TABLE `pedido_som_item`
  ADD CONSTRAINT `fk_pedido_som_item_classe`
  FOREIGN KEY (`classe_id`) REFERENCES `classe_som`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ============================================================
-- Parte B: comissão — config + histórico de período quinzenal
-- ============================================================
CREATE TABLE `comissao_config` (
    `id`                  INTEGER      NOT NULL AUTO_INCREMENT,
    `valor_bateria`       DECIMAL(10, 2) NOT NULL,
    `percentual_mao_obra` DECIMAL(5, 2)  NOT NULL,
    `updated_at`          DATETIME(0)  NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by`          VARCHAR(120) NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `comissao_periodo` (
    `id`          INTEGER     NOT NULL AUTO_INCREMENT,
    `data_inicio` DATETIME(0) NOT NULL,
    `data_fim`    DATETIME(0) NOT NULL,
    `fechado_at`  DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    INDEX `idx_comissao_periodo_inicio`(`data_inicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `comissao_periodo_item` (
    `id`                 INTEGER      NOT NULL AUTO_INCREMENT,
    `periodo_id`         INTEGER      NOT NULL,
    `vendedor`           VARCHAR(50)  NOT NULL,
    `qtd_baterias`       INTEGER      NOT NULL DEFAULT 0,
    `base_mao_obra`      DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `valor_comissao`     DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `snap_valor_bateria` DECIMAL(10, 2) NOT NULL,
    `snap_percentual`    DECIMAL(5, 2)  NOT NULL,
    INDEX `idx_comissao_periodo_item_periodo`(`periodo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `comissao_periodo_item`
  ADD CONSTRAINT `fk_comissao_periodo_item`
  FOREIGN KEY (`periodo_id`) REFERENCES `comissao_periodo`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Config inicial (a aplicação também cria sozinha se faltar; deixamos o padrão).
INSERT INTO `comissao_config` (`valor_bateria`, `percentual_mao_obra`) VALUES (15.00, 30.00);
