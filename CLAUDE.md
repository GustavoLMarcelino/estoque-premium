# Estoque Premium — regras do projeto para o Claude Code

## Regras que o ponytail (ou qualquer skill) NUNCA simplifica

- Responder sempre em português do Brasil, inclusive ao executar skills (ponytail-review, ponytail-audit etc.), mesmo que a skill peça inglês.
- Ritual de SQL: backup, .sql em /tmp, hash SHA-256, guards, dry-run com ROLLBACK, execução real só com --confirmo-irreversivel e aprovação explícita do Gustavo.
- Deploy guard e registro manual no APLICADOS.md.
- Fluxo de trabalho: investigar (read-only) → relatório → aprovação → implementar → relatório em 4 seções (o que mudou, o que foi testado, riscos e pendências, SQL sim/não) → commit e push só com OK.
- Commits separados por feature; nunca misturar SQL + código + fix.
- Layout mobile/tablet não é tocado sem pedido explícito.
- Não usar comentários "shortcut:" neste projeto.
