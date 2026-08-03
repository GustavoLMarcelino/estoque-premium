# SQL manual aplicado no RDS (produção)

Registro de quais migrações manuais **já rodaram** no banco de produção.
Antes deste arquivo, olhar o repositório não respondia a pergunta mais
importante de todas: *"esse `.sql` já rodou?"*.

## O que este arquivo é — e o que NÃO é

- **É** o histórico: o que rodou, quando e quem rodou.
- **NÃO é** a porta de liberação do deploy. Quem libera é o
  `workflow_dispatch` com o input `sql_aplicado` (ver `deploy.yml`).

A distinção é proposital. Um arquivo commitado seria escrito no **mesmo commit**
do `.sql`, antes de o SQL ter rodado — viraria reflexo e daria uma falsa
sensação de segurança. A liberação precisa acontecer **depois** do push, com o
SQL já aplicado. Aqui é só memória.

O preenchimento é **manual**: um append automático que falhasse deixaria o
deploy travado por causa do registro, e não por causa do banco — o oposto do
objetivo. Preencha depois de liberar o deploy.

## Ordem correta de uma mudança de schema

1. Escreve o `.sql` em `backend/prisma/sql/` e o código que depende dele.
2. `git push` → **o guard trava o deploy** (é o esperado).
3. Roda o `.sql` no RDS — snapshot antes.
4. Actions → *Deploy para Produção (EC2)* → **Run workflow** → em `sql_aplicado`,
   o nome do arquivo.
5. Adiciona a linha aqui embaixo.

## Aplicados

| Arquivo | Data (aplicado no RDS) | Quem rodou | Observação |
|---|---|---|---|
| _(anteriores ao guard)_ | — | Gustavo | Os 9 `.sql` de `sql/` e `manual/` já estavam aplicados quando o guard foi criado; não houve registro individual na época. |
| backend/prisma/sql/2026-07-31-remove-classe-som.sql | 31/07/2026 | Gustavo | DML: `SET NULL` em estoque_som/pedido_som_item + `DELETE classe_som WHERE categoria='SOM'`; 21/0/11 linhas; verificado: só INSULFILME, produtos_com_classe=0. |
| backend/prisma/sql/2026-08-03-parcelas-pedido-som.sql | 03/08/2026 | Gustavo | DDL: `ALTER TABLE pedido_som ADD COLUMN parcelas INT NULL`; sem backfill (pedidos anteriores ficam NULL); verificado: coluna existe, int, nullable. |

<!-- Novas linhas vão ABAIXO desta, uma por SQL, mais recente por último:
| backend/prisma/sql/2026-08-01-exemplo.sql | 01/08/2026 | Gustavo | — |
-->
