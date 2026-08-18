-- Migração manual para PRODUÇÃO (RDS / MySQL) — Estoque Premium
-- Torna o documento do cliente (CPF/CNPJ) OPCIONAL nas garantias.
-- Rodar UMA vez. Faça snapshot do RDS antes.
--
-- O QUE MUDA: só a nulabilidade. A coluna continua existindo, com o mesmo
-- tipo, tamanho, charset e collation. Nenhum dado é tocado — as garantias
-- que já têm documento continuam exatamente como estão.
--
-- POR QUE PODE RODAR ANTES DO DEPLOY: afrouxar uma restrição é aditivo do
-- ponto de vista do código publicado. O Prisma Client atual declara o campo
-- como String (obrigatório), mas ele só INSERE valores — nunca vai gravar
-- NULL sozinho. Enquanto o código novo não sobe, nada muda de comportamento.
-- É o inverso de um DROP, que quebraria na hora.
--
-- ⚠️ CHARSET/COLLATION RESTATADOS DE PROPÓSITO: MODIFY COLUMN reescreve a
-- definição inteira da coluna. Tudo que não for repetido aqui é substituído
-- pelo default da tabela — inclusive collation. Conferido no RDS antes de
-- escrever: utf8mb4 / utf8mb4_unicode_ci, sem DEFAULT e sem COMMENT.

-- ---------------------------------------------------------------------------
-- CONFERIR ANTES (esperado: IS_NULLABLE = NO, varchar(20), utf8mb4_unicode_ci)
-- ---------------------------------------------------------------------------
-- SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_SET_NAME,
--        COLLATION_NAME, COLUMN_COMMENT
--   FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='garantias'
--    AND COLUMN_NAME='cliente_documento';
--
-- Volume atual (nada aqui é alterado — só para constar no registro):
-- SELECT COUNT(*) AS garantias,
--        SUM(cliente_documento IS NOT NULL AND cliente_documento<>'') AS com_doc
--   FROM garantias;

-- ---------------------------------------------------------------------------
-- A MUDANÇA
-- ---------------------------------------------------------------------------
ALTER TABLE garantias
  MODIFY COLUMN cliente_documento VARCHAR(20)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;

-- ---------------------------------------------------------------------------
-- CONFERIR DEPOIS
-- ---------------------------------------------------------------------------
-- Esperado: IS_NULLABLE = YES, e todo o resto IDÊNTICO ao de antes.
-- SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_SET_NAME,
--        COLLATION_NAME, COLUMN_COMMENT
--   FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='garantias'
--    AND COLUMN_NAME='cliente_documento';
--
-- Esperado: mesma contagem de antes — a migração não mexe em dado.
-- SELECT COUNT(*) AS garantias,
--        SUM(cliente_documento IS NOT NULL AND cliente_documento<>'') AS com_doc
--   FROM garantias;
