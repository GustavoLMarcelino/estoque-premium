-- Migração manual para PRODUÇÃO (RDS / MySQL) — Estoque Premium
-- Insulfilme no Pedido de Instalação: categoria nas classes + comissão do Joel
-- diferenciada (Som 30% / Insulfilme 25%).
-- Rodar UMA vez, ANTES de subir o código. Faça snapshot do RDS antes.
--
-- DDL gerado por `prisma migrate diff` sobre schema.mysql.prisma.
-- Todos os DEFAULT garantem que linhas existentes ficam válidas sem migração de
-- dados: classes viram SOM, config existente ganha 25%, períodos fechados ficam
-- com Insulfilme 0 (eram 100% Som). Retrocompatível.

-- 1) Classes ganham categoria (SOM | INSULFILME)
ALTER TABLE `classe_som`
  ADD COLUMN `categoria` VARCHAR(20) NOT NULL DEFAULT 'SOM';

-- 2) Config de comissão ganha o % de Insulfilme
ALTER TABLE `comissao_config`
  ADD COLUMN `percentual_insulfilme` DECIMAL(5, 2) NOT NULL DEFAULT 25;

-- 3) Pedido guarda a porção Insulfilme da mão de obra (Som = total − esta)
ALTER TABLE `pedido_som`
  ADD COLUMN `valor_mao_obra_insulfilme` DECIMAL(10, 2) NULL;

-- 4) Snapshot do fechamento por categoria
ALTER TABLE `comissao_periodo_item`
  ADD COLUMN `base_insulfilme` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `snap_percentual_insulfilme` DECIMAL(5, 2) NOT NULL DEFAULT 0;

-- 5) Classes de Insulfilme iniciais (as variações de preço — 2 portas, vidro
--    avulso — são resolvidas com o override de mão de obra por item no Pedido).
INSERT INTO `classe_som` (`nome`, `valor_mao_obra`, `categoria`, `ativo`) VALUES
  ('Insulfilme Padrão', 380.00, 'INSULFILME', 1),
  ('Insulfilme + Parabrisa', 460.00, 'INSULFILME', 1);
