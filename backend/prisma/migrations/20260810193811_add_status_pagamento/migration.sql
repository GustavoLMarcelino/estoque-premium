-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_movimentacoes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "produto_id" INTEGER NOT NULL,
    "garantia_id" INTEGER,
    "tipo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "valor_final" DECIMAL NOT NULL,
    "motivo" TEXT,
    "vendedor" TEXT,
    "forma_pagamento" TEXT,
    "parcelas" INTEGER,
    "status_pagamento" TEXT NOT NULL DEFAULT 'PAGO',
    "data_pagamento" DATETIME,
    "data_movimentacao" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "created_by" TEXT,
    CONSTRAINT "movimentacoes_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "estoque" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_movimentacoes" ("created_by", "data_movimentacao", "forma_pagamento", "garantia_id", "id", "motivo", "parcelas", "produto_id", "quantidade", "tipo", "user_id", "valor_final", "vendedor") SELECT "created_by", "data_movimentacao", "forma_pagamento", "garantia_id", "id", "motivo", "parcelas", "produto_id", "quantidade", "tipo", "user_id", "valor_final", "vendedor" FROM "movimentacoes";
DROP TABLE "movimentacoes";
ALTER TABLE "new_movimentacoes" RENAME TO "movimentacoes";
CREATE INDEX "fk_produto" ON "movimentacoes"("produto_id");
CREATE INDEX "idx_mov_garantia" ON "movimentacoes"("garantia_id");
CREATE INDEX "idx_mov_motivo" ON "movimentacoes"("motivo");
CREATE INDEX "idx_mov_status_pagamento" ON "movimentacoes"("status_pagamento");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
