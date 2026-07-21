-- Migração manual (produção MySQL/RDS): histórico de inventários finalizados.
-- Rodar ANTES do deploy do código (o push só vem depois da sua confirmação).
-- Pareada com a migration Prisma 20260721_inventario_historico (SQLite dev).
--
-- Contexto: a conferência de estoque hoje é um checklist — o conferente marca
-- "vi esse produto", mas NUNCA digita quanto contou. Por isso não existe (nem
-- dá para derivar) o número de divergências. Estas colunas passam a registrar a
-- contagem real por item e congelam o resumo agregado na finalização.
--
-- AUDITORIA PURA: o inventário continua NÃO alterando em_estoque. A divergência
-- é apenas REGISTRADA; a correção segue manual, pelo fluxo de Entrada/Saída.
--
-- Retrocompatível: todas as colunas são NULL. Linhas existentes seguem válidas e
-- o código antigo as ignora. Conferências já finalizadas ficam com totais NULL —
-- a tela mostra "—" / "sem dados de divergência", sem inventar número retroativo.
--
-- Faça snapshot do RDS antes.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Quantidade REAL contada pelo conferente.
--    NULL = item ainda não conferido. Um toque ("bateu") grava
--    qtd_contada = qtd_sistema; "Divergiu" grava o número digitado.
--    NÃO é snapshot item a item: é uma coluna numa linha que já existe
--    durante a conferência — não multiplica registros.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE `conferencia_item`
  ADD COLUMN `qtd_contada` INT NULL AFTER `qtd_sistema`;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Quem FINALIZOU a conferência.
--    Diferente de created_by, que é quem INICIOU — com pausar/retomar podem
--    ser pessoas diferentes, e a tela creditava a pessoa errada.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE `conferencia_estoque`
  ADD COLUMN `finalizada_por_id` INT NULL AFTER `finalizada_at`,
  ADD COLUMN `finalizada_por` VARCHAR(120) NULL AFTER `finalizada_por_id`;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Resumo agregado, CONGELADO no momento da finalização.
--    Congelado (e não recalculado na listagem) por dois motivos: o número
--    continua verdadeiro para sempre, e a listagem do histórico deixa de
--    precisar carregar todos os itens de cada conferência.
--    total_divergencias = itens com qtd_contada <> qtd_sistema.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE `conferencia_estoque`
  ADD COLUMN `total_itens` INT NULL AFTER `finalizada_por`,
  ADD COLUMN `total_conferidos` INT NULL AFTER `total_itens`,
  ADD COLUMN `total_divergencias` INT NULL AFTER `total_conferidos`;

-- ─────────────────────────────────────────────────────────────────────────
-- Conferência (não altera nada): deve listar as 6 colunas novas, todas YES em
-- "Null" e com Default NULL.
--   SHOW COLUMNS FROM `conferencia_item` LIKE 'qtd_contada';
--   SHOW COLUMNS FROM `conferencia_estoque` WHERE Field IN
--     ('finalizada_por_id','finalizada_por','total_itens',
--      'total_conferidos','total_divergencias');
-- ─────────────────────────────────────────────────────────────────────────
