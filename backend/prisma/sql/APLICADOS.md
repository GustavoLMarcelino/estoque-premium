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

## Aplicados

> A coluna **Arquivo** é lida pelo guard (`backend/scripts/guard-sql-pendente.mjs`).
> Ele casa pelo **nome do arquivo**, então caminho completo ou nome puro
> funcionam — mas o nome precisa estar exato.

| Arquivo | Data (aplicado no RDS) | Quem rodou | Observação |
|---|---|---|---|
| backend/prisma/sql/2026-07-08-classe-som.sql | ≤ 17/07/2026 | Gustavo | Anterior ao guard. Registrado individualmente em 03/08/2026 no hardening (antes coberto por uma linha coletiva, que o gate por cobertura não consegue ler). |
| backend/prisma/sql/2026-07-08-emprestimo-garantia.sql | ≤ 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-08-garantia-fases-resultado-laudo.sql | ≤ 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-08-marca.sql | ≤ 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/manual/20260709_comissao_pedido_mao_obra.sql | ≤ 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/manual/20260710_insulfilme_categoria.sql | ≤ 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-14-permissoes-user.sql | ≤ 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-17-comissao-escopo-linha.sql | 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-17-taxas-forma-pagamento.sql | 17/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-21-inventario-historico.sql | 21/07/2026 | Gustavo | Anterior ao guard — idem. |
| backend/prisma/sql/2026-07-31-remove-classe-som.sql | 31/07/2026 | Gustavo | DML: `SET NULL` em estoque_som/pedido_som_item + `DELETE classe_som WHERE categoria='SOM'`; 21/0/11 linhas; verificado: só INSULFILME, produtos_com_classe=0. |
| backend/prisma/sql/2026-08-03-parcelas-pedido-som.sql | 03/08/2026 | Gustavo | DDL: `ALTER TABLE pedido_som ADD COLUMN parcelas INT NULL`; sem backfill (pedidos anteriores ficam NULL); verificado: coluna existe, int, nullable. |

<!-- Novas linhas vão ABAIXO desta, uma por SQL, mais recente por último:
| backend/prisma/sql/2026-08-01-exemplo.sql | 01/08/2026 | Gustavo | — |
-->
