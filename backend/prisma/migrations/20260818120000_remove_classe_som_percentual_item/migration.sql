-- DropIndex
DROP INDEX "classe_som_nome_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "classe_som";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_comissao_periodo_item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "periodo_id" INTEGER NOT NULL,
    "vendedor" TEXT NOT NULL,
    "qtd_baterias" INTEGER NOT NULL DEFAULT 0,
    "base_mao_obra" DECIMAL NOT NULL DEFAULT 0,
    "valor_comissao" DECIMAL NOT NULL DEFAULT 0,
    "snap_valor_bateria" DECIMAL NOT NULL,
    "snap_percentual_efetivo" DECIMAL,
    "base_insulfilme" DECIMAL NOT NULL DEFAULT 0,
    "snap_percentual" DECIMAL NOT NULL DEFAULT 0,
    "snap_percentual_insulfilme" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "comissao_periodo_item_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "comissao_periodo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_comissao_periodo_item" ("base_insulfilme", "base_mao_obra", "id", "periodo_id", "qtd_baterias", "snap_percentual", "snap_percentual_insulfilme", "snap_valor_bateria", "valor_comissao", "vendedor") SELECT "base_insulfilme", "base_mao_obra", "id", "periodo_id", "qtd_baterias", "snap_percentual", "snap_percentual_insulfilme", "snap_valor_bateria", "valor_comissao", "vendedor" FROM "comissao_periodo_item";
DROP TABLE "comissao_periodo_item";
ALTER TABLE "new_comissao_periodo_item" RENAME TO "comissao_periodo_item";
CREATE INDEX "idx_comissao_periodo_item_periodo" ON "comissao_periodo_item"("periodo_id");
CREATE TABLE "new_estoque_som" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "produto" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "marca_id" INTEGER NOT NULL,
    "custo" DECIMAL NOT NULL,
    "valor_venda" DECIMAL NOT NULL,
    "percentual_lucro" DECIMAL,
    "qtd_minima" INTEGER NOT NULL,
    "garantia" TEXT,
    "qtd_inicial" INTEGER NOT NULL,
    "entradas" INTEGER DEFAULT 0,
    "saidas" INTEGER DEFAULT 0,
    "em_estoque" INTEGER,
    "valor_vista" DECIMAL,
    "valor_parcelado" DECIMAL,
    "created_at" DATETIME,
    "updated_at" DATETIME,
    CONSTRAINT "estoque_som_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marca" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_estoque_som" ("created_at", "custo", "em_estoque", "entradas", "garantia", "id", "marca_id", "modelo", "percentual_lucro", "produto", "qtd_inicial", "qtd_minima", "saidas", "updated_at", "valor_parcelado", "valor_venda", "valor_vista") SELECT "created_at", "custo", "em_estoque", "entradas", "garantia", "id", "marca_id", "modelo", "percentual_lucro", "produto", "qtd_inicial", "qtd_minima", "saidas", "updated_at", "valor_parcelado", "valor_venda", "valor_vista" FROM "estoque_som";
DROP TABLE "estoque_som";
ALTER TABLE "new_estoque_som" RENAME TO "estoque_som";
CREATE INDEX "idx_estoque_som_marca" ON "estoque_som"("marca_id");
CREATE TABLE "new_pedido_som_item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pedido_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "produto_id" INTEGER,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valor_unit" DECIMAL NOT NULL,
    "valor_total" DECIMAL NOT NULL,
    "mao_obra_unit" DECIMAL,
    "mao_obra_total" DECIMAL,
    "percentual_comissao" DECIMAL,
    "baixa_estoque" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "pedido_som_item_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido_som" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_pedido_som_item" ("baixa_estoque", "descricao", "id", "mao_obra_total", "mao_obra_unit", "pedido_id", "produto_id", "quantidade", "tipo", "valor_total", "valor_unit") SELECT "baixa_estoque", "descricao", "id", "mao_obra_total", "mao_obra_unit", "pedido_id", "produto_id", "quantidade", "tipo", "valor_total", "valor_unit" FROM "pedido_som_item";
DROP TABLE "pedido_som_item";
ALTER TABLE "new_pedido_som_item" RENAME TO "pedido_som_item";
CREATE INDEX "idx_pedido_som_item_pedido" ON "pedido_som_item"("pedido_id");
CREATE INDEX "idx_pedido_som_item_produto" ON "pedido_som_item"("produto_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

