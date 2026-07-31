-- Migração manual para PRODUÇÃO (RDS / MySQL) — Estoque Premium
-- M2: remover o conceito de "classe" dos produtos de Som, mantendo Insulfilme.
-- Rodar UMA vez, ANTES de liberar o deploy (workflow_dispatch sql_aplicado).
-- Faça snapshot do RDS antes.
--
-- Só DML (sem ALTER): as colunas classe_id continuam no schema. estoque_som.classe_id
-- fica morto (sempre NULL); pedido_som_item.classe_id segue vivo para Insulfilme.
-- Os valores de mão de obra do histórico já estão congelados em
-- pedido_som_item.mao_obra_unit/total e em pedido_som.valor_mao_obra — zerar o
-- vínculo de classe NÃO perde dinheiro. Insulfilme (categoria='INSULFILME') fica intacto.

UPDATE estoque_som     SET classe_id = NULL WHERE classe_id IN (SELECT id FROM classe_som WHERE categoria='SOM');
UPDATE pedido_som_item SET classe_id = NULL WHERE classe_id IN (SELECT id FROM classe_som WHERE categoria='SOM');
DELETE FROM classe_som WHERE categoria='SOM';
