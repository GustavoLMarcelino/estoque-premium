-- Migração manual (produção MySQL/RDS): status de pagamento em vendas de Baterias.
-- Rodar ANTES do deploy do código (o push só vem depois da sua confirmação).
-- Pareada com a migration Prisma 20260810120000_add_status_pagamento (SQLite dev).
--
-- Contexto: uma saída de Baterias é uma linha de `movimentacoes` com tipo SAIDA,
-- e o sistema não distinguia venda paga na hora de venda fiado — tudo que saía
-- virava faturamento recebido no dashboard. Estas duas colunas separam o que foi
-- RECEBIDO do que foi apenas FATURADO.
--
-- O REGIME NÃO MUDA: a venda continua entrando em vendasBrutas/lucro na SAÍDA,
-- paga ou não (competência). `a receber` é um recorte à parte do que já está no
-- faturamento — nunca uma parcela a somar nem a subtrair.
--
-- NÃO afeta comissão: a apuração conta unidades por vendedor e não olha
-- pagamento. Fiado paga comissão igual a venda paga — decisão travada, com
-- teste de regressão em tests/comissao.test.js para que um "ajuste" futuro no
-- groupBy não quebre a regra em silêncio.

-- ─────────────────────────────────────────────────────────────────────────
-- status_pagamento: ENUM nativo, mesmo padrão de `tipo` (ENUM no MySQL,
-- String no SQLite de dev). NOT NULL DEFAULT 'PAGO' para que as linhas
-- existentes fiquem corretas SEM backfill: todas são vendas pagas na hora, e
-- todas têm forma de pagamento preenchida. Verificado no RDS imediatamente
-- antes desta migração: 36 saídas, das quais 35 são vendas (garantia_id NULL)
-- com 0 forma nula e 0 valor zerado; a 36ª é o empréstimo de garantia, que já
-- fica fora de faturamento e de comissão pelo filtro garantia_id.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE movimentacoes
  ADD COLUMN status_pagamento ENUM('PAGO','FIADO') NOT NULL DEFAULT 'PAGO'
  AFTER parcelas;

-- ─────────────────────────────────────────────────────────────────────────
-- data_pagamento: quando o fiado foi quitado. NULL nas vendas pagas na hora (o
-- pagamento é a própria data_movimentacao) e nos fiados ainda em aberto.
-- Preencher retroativamente as existentes duplicaria data_movimentacao e faria
-- "vendido em" e "quitado em" virarem o mesmo dado.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE movimentacoes
  ADD COLUMN data_pagamento DATETIME NULL
  AFTER status_pagamento;

-- Índice: o dashboard filtra por status dentro de uma janela de data. Baixa
-- cardinalidade, mas é filtro recorrente e a tabela só cresce.
CREATE INDEX idx_mov_status_pagamento ON movimentacoes (status_pagamento);

-- Conferência final:
-- SELECT status_pagamento, COUNT(*) AS linhas, SUM(valor_final*quantidade) AS valor
--   FROM movimentacoes WHERE tipo='SAIDA' GROUP BY 1;
--   → esperado: PAGO com todas as saídas existentes, FIADO 0
-- SHOW COLUMNS FROM movimentacoes LIKE 'status_pagamento';
--   → esperado: enum('PAGO','FIADO'), Null=NO, Default=PAGO
-- SHOW INDEX FROM movimentacoes WHERE Key_name='idx_mov_status_pagamento';
