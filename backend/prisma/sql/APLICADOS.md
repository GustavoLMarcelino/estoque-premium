# SQL manual aplicado no RDS (produção)

Registro de quais migrações manuais **já rodaram** no banco de produção.
Antes deste arquivo, olhar o repositório não respondia a pergunta mais
importante de todas: *"esse `.sql` já rodou?"*.

## O que este arquivo é

É o **registro de cobertura** do guard de deploy, e não só memória.

O guard não pergunta mais "este push traz `.sql` novo?" — pergunta **"existe
algum `.sql` no repositório que não está registrado aqui?"**. Se existir, ele
trava **todo** deploy, inclusive pushes que não têm nada a ver com banco, até a
linha ser adicionada.

> **Por que mudou.** A detecção anterior era pelo diff do push, e tinha um furo:
> o push que trazia o `.sql` era bloqueado, mas o push **seguinte** — sem `.sql`
> no range dele — passava verde e deployava o `HEAD`, que já continha o código
> dependente do SQL não aplicado. Foi assim que o M2 subiu sem passar pelo
> `workflow_dispatch`. Ancorar o gate no estado (este arquivo) em vez do diff
> fecha isso: um `.sql` não registrado bloqueia enquanto não for registrado.

O preenchimento é **manual**, de propósito. Um append automático seria escrito
no mesmo commit do `.sql`, antes de o SQL ter rodado no RDS — viraria reflexo e
daria falsa sensação de segurança. Aqui a linha só é escrita por quem rodou.

O `workflow_dispatch` com `sql_aplicado` continua existindo como **liberação
pontual**: serve para deployar na hora, sem esperar o push do registro. Ele
libera **aquele run** apenas — o próximo push volta a travar se a linha não
estiver aqui.

## Ordem correta de uma mudança de schema

1. Escreve o `.sql` em `backend/prisma/sql/` e o código que depende dele.
2. `git push` → **o guard trava o deploy** (é o esperado).
3. Roda o `.sql` no RDS — snapshot antes.
4. Adiciona a linha na tabela abaixo e faz push → **o deploy destrava sozinho**.

Se precisar do deploy antes do passo 4: Actions → *Deploy para Produção (EC2)* →
**Run workflow** → em `sql_aplicado`, o nome do arquivo. Depois volte e registre,
senão o próximo push trava.

## O hash, e o que ele protege

A coluna **Hash** registra o conteúdo do `.sql` no momento em que ele foi
aplicado. Sem ela, editar um arquivo já registrado passava batido: o nome
continuava o mesmo, o guard dizia "coberto", e o DDL no disco deixava de ser o
que rodou no banco.

> **O que o hash NÃO protege.** Nada impede escrever o `.sql` e esta linha no
> mesmo commit, sem nunca ter rodado o SQL no RDS. O hash prova *qual conteúdo*
> foi registrado, jamais *que ele rodou*. Fechar isso exigiria o pipeline
> consultar o RDS — custo de infraestrutura que não se paga hoje. É risco
> conhecido e aceito, e é por isso que o preenchimento é manual: a linha vale
> pela palavra de quem rodou.

## Arquivos ignorados pelo guard

`.sql` cujo nome começa com `_` **não** é cobrado aqui. É para o que não é DDL
de produção: rollback guardado, consulta de diagnóstico, exemplo. O guard lista
os ignorados em todo run, então a exclusão nunca é silenciosa.

Prefixo, e não subpasta, de propósito: o arquivo continua aparecendo no mesmo
`ls` dos DDL reais, e mover algo para "ignorado" é um rename visível no diff.

## Aplicados

> As colunas **Arquivo** e **Hash** são lidas pelo guard
> (`backend/scripts/guard-sql-pendente.mjs`), por posição.
> **Arquivo** casa pelo nome, então caminho completo ou nome puro funcionam —
> mas o nome precisa estar exato.
> **Hash** é o `sha256` do conteúdo com `\r\n` normalizado para `\n`, exibido nos
> 12 primeiros hex. A comparação é por prefixo: colar o hash inteiro também vale.
>
> A linha pronta sai de:
> ```
> node backend/scripts/gerar-hash-sql.mjs <arquivo.sql>
> ```

| Arquivo | Hash | Data (aplicado no RDS) | Quem rodou | Observação |
|---|---|---|---|---|
| backend/prisma/sql/2026-07-08-classe-som.sql | `adaf9a230580` | ≤ 17/07/2026 | Gustavo | Anterior ao guard. Registrado individualmente em 03/08/2026 no hardening (antes coberto por uma linha coletiva, que o gate por cobertura não consegue ler). |
| backend/prisma/sql/2026-07-08-emprestimo-garantia.sql | `6a2111fa6b79` | ≤ 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-08-garantia-fases-resultado-laudo.sql | `a461ab1fa9a3` | ≤ 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-08-marca.sql | `a908974415f9` | ≤ 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/manual/20260709_comissao_pedido_mao_obra.sql | `5941908a4b84` | ≤ 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/manual/20260710_insulfilme_categoria.sql | `384733af6591` | ≤ 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-14-permissoes-user.sql | `77145e02b55e` | ≤ 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-17-comissao-escopo-linha.sql | `78dcd2a57d15` | 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-17-taxas-forma-pagamento.sql | `b78b32d54d75` | 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-21-inventario-historico.sql | `119975014239` | 21/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-31-remove-classe-som.sql | `f4f8aaa2a969` | 31/07/2026 | Gustavo | DML: `SET NULL` em estoque_som/pedido_som_item + `DELETE classe_som WHERE categoria='SOM'`; 21/0/11 linhas; verificado: só INSULFILME, produtos_com_classe=0. |
| backend/prisma/sql/2026-08-03-parcelas-pedido-som.sql | `35823473ee98` | 03/08/2026 | Gustavo | DDL: `ALTER TABLE pedido_som ADD COLUMN parcelas INT NULL`; sem backfill (pedidos anteriores ficam NULL); verificado: coluna existe, int, nullable. |
| backend/prisma/sql/2026-08-03-venda-auditoria.sql | `dc46ec67f920` | 03/08/2026 | Gustavo | DDL: `CREATE TABLE venda_auditoria` — auditoria append-only de exclusão de venda (conteudo_anterior LONGTEXT). Verificado: tabela existe, 0 linhas, conteudo_anterior LONGTEXT (bate com o `String` dos dois schemas Prisma). |
| backend/prisma/sql/2026-08-10-status-pagamento-movimentacoes.sql | `f7e819803216` | 10/08/2026 | Gustavo | DDL: status_pagamento ENUM('PAGO','FIADO') NOT NULL DEFAULT 'PAGO' + data_pagamento DATETIME NULL + índice idx_mov_status_pagamento. Sem backfill: as 36 saídas existentes assumiram PAGO pelo default. Verificado: colunas nas posições 14/15, índice criado, FIADO 0. |
| backend/prisma/sql/2026-08-11-cliente-fiado-movimentacoes.sql | `d7dfee864e31` | 11/08/2026 | Gustavo | DDL: cliente_fiado VARCHAR(150) NULL após data_pagamento. Sem índice (o filtro é por status_pagamento, que já tem o seu) e sem backfill: as 44 linhas existentes são todas PAGO. Verificado: varchar(150) nullable na posição 16, 0 linhas preenchidas, nenhum índice novo. |
| backend/prisma/sql/2026-08-17-classe-som-parte1-percentual-item.sql | `deccb5e59f6d` | 18/08/2026 | Gustavo | Migração aditiva: percentual_comissao em pedido_som_item (backfill 17/17 itens, todos sem classe vinculada → fallback 30%) + snap_percentual_efetivo em comissao_periodo_item (backfill 2/2 períodos fechados do Joel). Paridade conferida: por-item R$828,00 = por-cabeçalho R$828,00, diferença zero. Parte 2 (DROPs de classe_som) roda só depois do deploy do código novo. |
| backend/prisma/sql/2026-08-17-classe-som-parte2-drops.sql | `c2d105fbc359` | 18/08/2026 | Gustavo | DDL destrutiva: DROP das FKs/índices/colunas classe_id em pedido_som_item e estoque_som + DROP TABLE classe_som. Rodada após confirmação de que o código em produção já não usava classe_id. Conferido: 3/3 alvos removidos, histórico de comissão preservado (17 itens, 17 com %, R$828,00 — idêntico ao pré-voo). |

<!-- Novas linhas vão ABAIXO desta, uma por SQL, mais recente por último.
Gere a linha com `node backend/scripts/gerar-hash-sql.mjs <arquivo.sql>`:
| backend/prisma/sql/2026-08-01-exemplo.sql | `0123456789ab` | 01/08/2026 | Gustavo | — |
-->
