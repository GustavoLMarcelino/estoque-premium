-- Migração manual (produção MySQL/RDS): redesenho do fluxo de garantia.
-- Rodar ANTES do deploy do código que usa o novo enum e as colunas novas.
--
-- Duas mudanças:
--   1) Troca os valores do enum garantias.status para as 4 FASES FÍSICAS do
--      processo (AGUARDANDO_ENVIO -> RECOLHIDA -> EM_LOJA -> FINALIZADA),
--      substituindo o enum antigo (ABERTA/EM_ANALISE/APROVADA/REPROVADA/
--      FINALIZADA). O resultado da análise deixa de ser status e passa a ser
--      registrado em `resultado` + `laudo`.
--   2) Adiciona `resultado` (NOVA|MESMA, texto) e `laudo` (parecer em texto).
--
-- SEGURANÇA COM DADOS EXISTENTES:
--   - A tabela `garantias` está VAZIA em produção (confirmado). Portanto o
--     MODIFY do enum não precisa de mapeamento de valores antigos -> novos:
--     não há linha para converter. Rode a conferência (0) ANTES do MODIFY.
--   - `resultado` VARCHAR(10) NULL e `laudo` TEXT NULL são ambos NULLABLE —
--     nenhum ADD COLUMN exige valor obrigatório para linhas existentes.
--   - Se, por qualquer motivo, a tabela NÃO estiver vazia, o MODIFY do enum
--     em sql_mode estrito FALHA (não corrompe) caso alguma linha use um valor
--     fora do novo conjunto — resolva o mapeamento antes de reexecutar.

-- Conferência PRÉVIA (deve retornar 0 antes de prosseguir):
-- SELECT COUNT(*) AS total_garantias FROM garantias;

-- 1) Novo enum de fases + default na primeira fase.
ALTER TABLE garantias
  MODIFY COLUMN status
    ENUM('AGUARDANDO_ENVIO','RECOLHIDA','EM_LOJA','FINALIZADA')
    NOT NULL DEFAULT 'AGUARDANDO_ENVIO';

-- 2) Resultado do teste + laudo (ambos NULL; preenchidos na fase EM_LOJA).
ALTER TABLE garantias
  ADD COLUMN resultado VARCHAR(10) NULL AFTER descricao_problema,
  ADD COLUMN laudo     TEXT        NULL AFTER resultado;

-- Conferência PÓS:
-- SHOW CREATE TABLE garantias;   -- status = ENUM(4 fases); colunas resultado/laudo presentes
