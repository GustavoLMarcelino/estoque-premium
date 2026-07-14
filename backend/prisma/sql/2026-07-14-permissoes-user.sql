-- Migração manual (produção MySQL/RDS): permissões granulares por usuário.
-- Rodar ANTES do deploy do código de gerenciamento de usuários.
-- Pareada com a migration Prisma 20260714190338_add_permissoes_user (SQLite dev).
--
-- Modelo: JSON de booleans por tela ({"home":true,...}); chave ausente = false.
-- role=admin BYPASSA tudo (não depende desta coluna). Catálogo de chaves:
-- backend/src/utils/permissoes.js.

-- 1) Coluna (default '{}' = nenhum acesso até o admin configurar)
ALTER TABLE user
  ADD COLUMN permissoes VARCHAR(2000) NOT NULL DEFAULT '{}' AFTER role;

-- 2) Conferir os usuários existentes ANTES do backfill (identificar Ismael/Joel)
SELECT id, name, email, role FROM user;

-- 3) Backfill — ATENÇÃO: confirmar os e-mails reais antes de rodar.
--    Admin: sem backfill (bypass por role).
--    Ismael: telas operacionais do dia a dia, SEM custo.
UPDATE user SET permissoes = JSON_OBJECT(
  'tabela_precos', TRUE,
  'entrada_saida', TRUE,
  'reg_movimentacao', TRUE,
  'garantia', TRUE,
  'consulta_garantia', TRUE,
  'emprestimos', TRUE,
  'ver_custo', FALSE
) WHERE email = '<EMAIL_DO_ISMAEL>' AND role <> 'admin';

--    Joel: bloqueado ('{}', já é o default da coluna) até configurar pela
--    interface — nenhum UPDATE necessário; linha abaixo é só explícita.
UPDATE user SET permissoes = '{}' WHERE email = '<EMAIL_DO_JOEL>' AND role <> 'admin';

-- Conferência:
-- SELECT id, name, email, role, permissoes FROM user;
