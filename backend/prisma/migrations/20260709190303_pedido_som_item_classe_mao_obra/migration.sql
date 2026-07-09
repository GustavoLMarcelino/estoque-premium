-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_pedido_som_item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pedido_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "produto_id" INTEGER,
    "classe_id" INTEGER,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valor_unit" DECIMAL NOT NULL,
    "valor_total" DECIMAL NOT NULL,
    "mao_obra_unit" DECIMAL,
    "mao_obra_total" DECIMAL,
    "baixa_estoque" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "pedido_som_item_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido_som" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pedido_som_item_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "classe_som" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_pedido_som_item" ("baixa_estoque", "descricao", "id", "pedido_id", "produto_id", "quantidade", "tipo", "valor_total", "valor_unit") SELECT "baixa_estoque", "descricao", "id", "pedido_id", "produto_id", "quantidade", "tipo", "valor_total", "valor_unit" FROM "pedido_som_item";
DROP TABLE "pedido_som_item";
ALTER TABLE "new_pedido_som_item" RENAME TO "pedido_som_item";
CREATE INDEX "idx_pedido_som_item_pedido" ON "pedido_som_item"("pedido_id");
CREATE INDEX "idx_pedido_som_item_produto" ON "pedido_som_item"("produto_id");
CREATE INDEX "idx_pedido_som_item_classe" ON "pedido_som_item"("classe_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
