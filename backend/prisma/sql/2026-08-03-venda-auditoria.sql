-- Migração manual (produção MySQL/RDS): diário de auditoria de venda.
-- Rodar ANTES do deploy do código (o push só vem depois da sua confirmação).
-- Pareada com a migration Prisma 20260803210000_venda_auditoria (SQLite dev).
--
-- Contexto: excluir venda é hard-delete — a linha some do banco. Sem isto, não
-- resta rastro nenhum de quem apagou, quando, nem do que havia ali. Para um
-- sistema que apura faturamento e comissão, "esse pedido nunca existiu" e
-- "esse pedido foi apagado ontem às 14h pelo admin" são coisas muito
-- diferentes, e hoje o banco não sabe distinguir.
--
-- TABELA À PARTE, e não soft-delete: um `deleted_at` na própria venda obrigaria
-- TODO leitor a filtrar (dashboard, comissão, listagens, estoque). Esquecer um
-- único filtro faria número de dinheiro sair errado, silenciosamente. Aqui
-- nenhum leitor existente muda — a tabela só recebe append.
--
-- APPEND-ONLY por contrato: o app só faz INSERT. Nunca UPDATE, nunca DELETE.
--
-- SEM foreign key, de propósito:
--   • para a venda — ela deixou de existir; é justamente o ponto.
--   • para user    — apagar um usuário não pode derrubar nem travar o
--                    histórico. feito_por congela o e-mail do momento.
--
-- Não retroativo: exclusões feitas ANTES desta tabela não têm como ser
-- recuperadas. O diário começa vazio e passa a valer da aplicação em diante.
--
-- Faça snapshot do RDS antes.

-- ─────────────────────────────────────────────────────────────────────────
-- conteudo_anterior é LONGTEXT com JSON serializado, e NÃO a coluna JSON
-- nativa do MySQL. Motivo: o SQLite de desenvolvimento não tem escalar Json,
-- então o campo teria que ser String lá. Com JSON aqui e String lá, a MESMA
-- linha de código gravaria objeto em produção e texto em dev — e a suíte
-- inteira roda em SQLite, então a divergência só apareceria em produção,
-- gravando JSON duplamente escapado. É o mesmo padrão já usado em
-- user.permissoes (JSON em String nos dois schemas).
--
-- LONGTEXT (e não TEXT): o snapshot de um pedido de Som carrega os itens e as
-- movimentações vinculadas. TEXT limita em 64 KB; o custo de LONGTEXT é 2
-- bytes a mais no prefixo de tamanho, e o alívio é não ter teto prático.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE `venda_auditoria` (
  `id`                INT          NOT NULL AUTO_INCREMENT,
  `linha`             VARCHAR(20)  NOT NULL COMMENT 'baterias | som',
  `entidade`          VARCHAR(40)  NOT NULL COMMENT 'movimentacoes | movimentacoes_som | pedido_som',
  `entidade_id`       INT          NOT NULL COMMENT 'id que a linha TINHA antes de sumir',
  `acao`              VARCHAR(20)  NOT NULL COMMENT 'EXCLUSAO | EDICAO',
  `conteudo_anterior` LONGTEXT     NOT NULL COMMENT 'snapshot JSON do estado anterior',
  `user_id`           INT          NULL,
  `feito_por`         VARCHAR(120) NULL COMMENT 'e-mail congelado no momento da ação',
  `feito_em`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_venda_auditoria_entidade` (`entidade`, `entidade_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- Conferência (não altera nada): a tabela deve existir, vazia, com as 9
-- colunas e o índice composto.
--   SHOW CREATE TABLE `venda_auditoria`;
--   SELECT COUNT(*) FROM `venda_auditoria`;                 -- espera 0
--   SHOW INDEX FROM `venda_auditoria`;                      -- PRIMARY + idx_…
--
-- Teste de fumaça DEPOIS do deploy (exclua uma venda de teste e confira):
--   SELECT id, linha, entidade, entidade_id, acao, feito_por, feito_em
--     FROM `venda_auditoria` ORDER BY id DESC LIMIT 5;
-- ─────────────────────────────────────────────────────────────────────────
