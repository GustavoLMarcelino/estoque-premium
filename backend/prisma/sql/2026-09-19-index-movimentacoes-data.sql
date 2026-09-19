-- Migração manual para PRODUÇÃO (RDS / MySQL) — Estoque Premium
-- Adiciona índice em movimentacoes.data_movimentacao — coluna usada em
-- filtro de intervalo por vendasResumo.js e comissao.routes.js, sem
-- índice até agora. Puramente aditivo: não altera dado nem outras colunas.

CREATE INDEX idx_mov_data ON movimentacoes (data_movimentacao);
