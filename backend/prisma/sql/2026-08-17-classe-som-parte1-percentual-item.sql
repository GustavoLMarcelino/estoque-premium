-- Migração manual para PRODUÇÃO (RDS / MySQL) — Estoque Premium
-- PARTE 1 de 2 — ADITIVA. Remoção do catálogo classe_som + comissão do Joel
-- por % livre POR ITEM.
-- Rodar UMA vez. Faça snapshot do RDS antes.
--
-- MODELO QUE SAI: dois baldes globais (percentual_mao_obra / percentual_insulfilme
--   em comissao_config), com classe_som.categoria decidindo em qual balde cada
--   item cai.
-- MODELO QUE ENTRA: cada item de mão de obra carrega a SUA própria %, congelada
--   na venda em pedido_som_item.percentual_comissao. A apuração vira
--   Σ (mao_obra_total × percentual_comissao / 100). Sem categoria, sem catálogo.
--
-- POR QUE ESTA PARTE RODA ANTES DO CÓDIGO: tudo aqui é ADITIVO (ADD COLUMN +
-- UPDATE). O Prisma Client lista colunas explicitamente nos SELECTs, então
-- coluna nova é invisível para o código já publicado. Nada quebra.
--
-- ⚠️ NÃO RODE A PARTE 2 (drops) ANTES DO DEPLOY DO CÓDIGO NOVO. Ver o cabeçalho
-- dela. É a mesma razão pela qual 2026-07-31-remove-classe-som.sql evitou ALTER.
--
-- ⚠️ ORDEM É LOAD-BEARING: todo backfill acontece ANTES de qualquer DROP. Depois
-- da parte 2 a categoria deixa de existir e não há de onde re-derivar a %.

-- ---------------------------------------------------------------------------
-- PASSO 0 — censo de partida (rode e guarde a saída antes de mudar nada)
-- ---------------------------------------------------------------------------
-- SELECT COUNT(*) AS itens_total,
--        SUM(classe_id IS NOT NULL) AS com_classe,
--        SUM(mao_obra_total IS NOT NULL AND mao_obra_total > 0) AS com_mao_obra
--   FROM pedido_som_item;
-- SELECT tipo, COUNT(*) AS itens, SUM(mao_obra_total) AS soma
--   FROM pedido_som_item
--  WHERE mao_obra_total IS NOT NULL AND mao_obra_total > 0
--  GROUP BY tipo;
-- SELECT c.categoria, COUNT(i.id) AS itens FROM pedido_som_item i
--   JOIN classe_som c ON c.id = i.classe_id GROUP BY c.categoria;
-- SELECT COUNT(*) AS periodos_fechados FROM comissao_periodo_item;

-- ---------------------------------------------------------------------------
-- PASSO 1 — coluna da % por item
-- ---------------------------------------------------------------------------
ALTER TABLE pedido_som_item
  ADD COLUMN percentual_comissao DECIMAL(5,2) NULL AFTER mao_obra_total;

-- ---------------------------------------------------------------------------
-- PASSO 2 — BACKFILL da % dos itens que hoje têm classe.
-- Usa a config VIGENTE (não os literais 25/30) para refletir o que a apuração
-- realmente vinha aplicando. comissao_config é singleton; o código lê o menor
-- id (findFirst orderBy id asc), então o backfill lê o mesmo.
-- ---------------------------------------------------------------------------
UPDATE pedido_som_item i
  JOIN classe_som c   ON c.id = i.classe_id
  JOIN comissao_config cfg ON cfg.id = (SELECT MIN(id) FROM comissao_config)
   SET i.percentual_comissao = CASE
         WHEN c.categoria = 'INSULFILME' THEN cfg.percentual_insulfilme
         ELSE cfg.percentual_mao_obra
       END;

-- Itens COM mão de obra e SEM classe (serviço manual e produto legado) nunca
-- tiveram categoria: sempre caíram no balde de Som. Congela isso explicitamente
-- em vez de deixar NULL — NULL depende do fallback em runtime, e fallback é
-- comportamento, não dado. Ver apurar() em comissao.routes.js.
UPDATE pedido_som_item i
  JOIN comissao_config cfg ON cfg.id = (SELECT MIN(id) FROM comissao_config)
   SET i.percentual_comissao = cfg.percentual_mao_obra
 WHERE i.classe_id IS NULL
   AND i.mao_obra_total IS NOT NULL
   AND i.mao_obra_total > 0
   AND i.percentual_comissao IS NULL;

-- ---------------------------------------------------------------------------
-- PASSO 3 — % efetiva no snapshot de período fechado.
-- Os campos do modelo de dois baldes (base_insulfilme, snap_percentual,
-- snap_percentual_insulfilme) FICAM, como legado morto: são a única prova do
-- que já foi pago. Dropar é assunto de outro ciclo.
-- ---------------------------------------------------------------------------
ALTER TABLE comissao_periodo_item
  ADD COLUMN snap_percentual_efetivo DECIMAL(5,2) NULL AFTER snap_percentual_insulfilme;

-- ---------------------------------------------------------------------------
-- PASSO 4 — BACKFILL dos períodos fechados.
-- ⚠️ A ORDEM DAS DUAS ATRIBUIÇÕES É LOAD-BEARING: o MySQL avalia as colunas de
-- um UPDATE da esquerda para a direita, usando o valor JÁ ATUALIZADO nas
-- seguintes. snap_percentual_efetivo precisa ser calculado com o base_mao_obra
-- ANTIGO (só Som), por isso vem primeiro. Inverter dá % errada e silenciosa.
--
-- base_mao_obra MUDA DE SIGNIFICADO aqui: era a base de Som (total − insulfilme),
-- passa a ser a base TOTAL de mão de obra. Sem esta soma o painel passaria a
-- subnotificar o histórico.
-- Linhas de bateria têm base 0 → NULLIF devolve NULL → % efetiva NULL. Correto:
-- bateria não tem percentual, tem valor fixo por unidade.
-- ---------------------------------------------------------------------------
UPDATE comissao_periodo_item
   SET snap_percentual_efetivo = valor_comissao / NULLIF(base_mao_obra + base_insulfilme, 0) * 100,
       base_mao_obra           = base_mao_obra + base_insulfilme;

-- ---------------------------------------------------------------------------
-- PASSO 5 — CONFERIR. Não libere o deploy nem rode a parte 2 se algo divergir.
-- ---------------------------------------------------------------------------
-- (a) Todo item com mão de obra tem % gravada? Esperado: faltando = 0
-- SELECT COUNT(*) AS faltando FROM pedido_som_item
--  WHERE mao_obra_total IS NOT NULL AND mao_obra_total > 0
--    AND percentual_comissao IS NULL;
--
-- (b) Distribuição das % gravadas (esperado: só os valores da config vigente)
-- SELECT percentual_comissao, COUNT(*) AS itens, SUM(mao_obra_total) AS soma
--   FROM pedido_som_item WHERE percentual_comissao IS NOT NULL
--  GROUP BY percentual_comissao ORDER BY percentual_comissao;
--
-- (c) PARIDADE DA COMISSÃO — o teste que importa. A soma por item tem de bater
--     com o que o modelo de dois baldes produzia no cabeçalho. Diferença de
--     centavos é arredondamento; diferença de reais é backfill errado.
-- SELECT ROUND(SUM(i.mao_obra_total * i.percentual_comissao / 100), 2) AS por_item,
--        (SELECT ROUND(SUM(comissao_joel), 2) FROM pedido_som) AS por_cabecalho
--   FROM pedido_som_item i WHERE i.mao_obra_total IS NOT NULL;
--
-- (d) Períodos fechados com % efetiva preenchida (esperado: todas as linhas do
--     Joel; linhas de bateria ficam NULL)
-- SELECT vendedor, COUNT(*) AS linhas,
--        SUM(snap_percentual_efetivo IS NOT NULL) AS com_pct
--   FROM comissao_periodo_item GROUP BY vendedor;
