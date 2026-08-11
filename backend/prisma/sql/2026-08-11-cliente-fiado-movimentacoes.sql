-- Migração manual (produção MySQL/RDS): nome do cliente na venda fiado.
-- Rodar ANTES do deploy do código (o push só vem depois da sua confirmação).
-- Pareada com a migration Prisma add_cliente_fiado (SQLite dev).
--
-- Depende de 2026-08-10-status-pagamento-movimentacoes.sql, que criou
-- status_pagamento e data_pagamento. Esta coluna vem logo depois delas: um
-- fiado sem dono é uma dívida que ninguém sabe cobrar.
--
-- NÃO existe cadastro de cliente no sistema, e criar um por causa disto seria
-- caro demais para o que resolve. Texto livre é a modelagem certa aqui: o dado
-- serve para uma pessoa ler na tela e lembrar de quem cobrar, não para
-- relacionar, agrupar nem faturar.

-- ─────────────────────────────────────────────────────────────────────────
-- cliente_fiado: NULL sem default, sem backfill. As 44 linhas existentes são
-- todas PAGO (verificado no RDS imediatamente antes desta migração) e nenhuma
-- tem dono a registrar — preencher qualquer coisa nelas seria inventar dado.
--
-- VARCHAR(150) por paridade com garantias.cliente_nome, a única outra coluna
-- de nome de cliente da base. O maior nome já usado lá tem 14 caracteres, então
-- o limite é folga pura — mas duas colunas com o mesmo papel e tamanhos
-- diferentes é o tipo de divergência que ninguém consegue justificar depois.
--
-- SEM ÍNDICE, de propósito: o filtro "Fiados em aberto" é por status_pagamento,
-- que já tem idx_mov_status_pagamento. Se um dia este campo entrar na busca por
-- nome, será via LIKE '%x%', que não usa índice de prefixo de qualquer forma.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE movimentacoes
  ADD COLUMN cliente_fiado VARCHAR(150) NULL
  AFTER data_pagamento;

-- Conferência final:
-- SHOW COLUMNS FROM movimentacoes LIKE 'cliente_fiado';
--   → esperado: varchar(150), Null=YES, Default=NULL
-- SELECT COUNT(*) FROM movimentacoes WHERE cliente_fiado IS NOT NULL;
--   → esperado: 0
