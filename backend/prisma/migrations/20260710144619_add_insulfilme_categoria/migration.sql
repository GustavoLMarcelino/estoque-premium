-- AlterTable
ALTER TABLE "pedido_som" ADD COLUMN "valor_mao_obra_insulfilme" DECIMAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_classe_som" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "valor_mao_obra" DECIMAL NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'SOM',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_classe_som" ("ativo", "created_at", "id", "nome", "valor_mao_obra") SELECT "ativo", "created_at", "id", "nome", "valor_mao_obra" FROM "classe_som";
DROP TABLE "classe_som";
ALTER TABLE "new_classe_som" RENAME TO "classe_som";
CREATE UNIQUE INDEX "classe_som_nome_key" ON "classe_som"("nome");
CREATE TABLE "new_comissao_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "valor_bateria" DECIMAL NOT NULL,
    "percentual_mao_obra" DECIMAL NOT NULL,
    "percentual_insulfilme" DECIMAL NOT NULL DEFAULT 25,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT
);
INSERT INTO "new_comissao_config" ("id", "percentual_mao_obra", "updated_at", "updated_by", "valor_bateria") SELECT "id", "percentual_mao_obra", "updated_at", "updated_by", "valor_bateria" FROM "comissao_config";
DROP TABLE "comissao_config";
ALTER TABLE "new_comissao_config" RENAME TO "comissao_config";
CREATE TABLE "new_comissao_periodo_item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "periodo_id" INTEGER NOT NULL,
    "vendedor" TEXT NOT NULL,
    "qtd_baterias" INTEGER NOT NULL DEFAULT 0,
    "base_mao_obra" DECIMAL NOT NULL DEFAULT 0,
    "base_insulfilme" DECIMAL NOT NULL DEFAULT 0,
    "valor_comissao" DECIMAL NOT NULL DEFAULT 0,
    "snap_valor_bateria" DECIMAL NOT NULL,
    "snap_percentual" DECIMAL NOT NULL,
    "snap_percentual_insulfilme" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "comissao_periodo_item_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "comissao_periodo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_comissao_periodo_item" ("base_mao_obra", "id", "periodo_id", "qtd_baterias", "snap_percentual", "snap_valor_bateria", "valor_comissao", "vendedor") SELECT "base_mao_obra", "id", "periodo_id", "qtd_baterias", "snap_percentual", "snap_valor_bateria", "valor_comissao", "vendedor" FROM "comissao_periodo_item";
DROP TABLE "comissao_periodo_item";
ALTER TABLE "new_comissao_periodo_item" RENAME TO "comissao_periodo_item";
CREATE INDEX "idx_comissao_periodo_item_periodo" ON "comissao_periodo_item"("periodo_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
