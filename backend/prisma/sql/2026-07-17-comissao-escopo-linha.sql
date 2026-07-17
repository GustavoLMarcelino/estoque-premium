-- Rollout (produção MySQL/RDS): escopo de linha do Ismael.
-- Opção (ii) — rodar ANTES do deploy do código, zero downtime: o código ATUAL
-- faz JSON.parse e lê chaves específicas; a chave nova linha_baterias que ele
-- ainda não conhece é simplesmente ignorada. Quando o código novo sobe, o
-- Ismael já tem a linha. SEM ALTER TABLE — só reescreve o JSON permissoes.
--
-- Estado-alvo do JSON (Ismael = operador de BATERIAS, sem Som, sem comissão,
-- sem custo). orcamento REMOVIDO (é tela de Som); reg_movimentacao ausente
-- (confirmado, ele não leva); linha_som e comissoes ausentes.

-- 1) Conferir o registro ANTES (identifica pelo email e garante que não é admin)
SELECT id, name, email, role, permissoes FROM user WHERE email = 'carinapamela147@gmail.com';

-- 2) Aplicar o estado-alvo (guard role <> 'admin' por segurança)
UPDATE user
SET permissoes = '{"tabela_precos":true,"entrada_saida":true,"garantia":true,"consulta_garantia":true,"emprestimos":true,"linha_baterias":true,"ver_custo":false}'
WHERE email = 'carinapamela147@gmail.com' AND role <> 'admin';

-- 3) Conferir DEPOIS
SELECT id, name, email, role, permissoes FROM user WHERE email = 'carinapamela147@gmail.com';
