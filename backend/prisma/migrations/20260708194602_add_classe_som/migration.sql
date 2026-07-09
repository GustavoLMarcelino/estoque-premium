-- CreateTable
CREATE TABLE "classe_som" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "valor_mao_obra" DECIMAL NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_estoque_som" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "produto" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "marca_id" INTEGER NOT NULL,
    "classe_id" INTEGER,
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
    CONSTRAINT "estoque_som_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marca" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "estoque_som_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "classe_som" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_estoque_som" ("created_at", "custo", "em_estoque", "entradas", "garantia", "id", "marca_id", "modelo", "percentual_lucro", "produto", "qtd_inicial", "qtd_minima", "saidas", "updated_at", "valor_parcelado", "valor_venda", "valor_vista") SELECT "created_at", "custo", "em_estoque", "entradas", "garantia", "id", "marca_id", "modelo", "percentual_lucro", "produto", "qtd_inicial", "qtd_minima", "saidas", "updated_at", "valor_parcelado", "valor_venda", "valor_vista" FROM "estoque_som";
DROP TABLE "estoque_som";
ALTER TABLE "new_estoque_som" RENAME TO "estoque_som";
CREATE INDEX "idx_estoque_som_marca" ON "estoque_som"("marca_id");
CREATE INDEX "idx_estoque_som_classe" ON "estoque_som"("classe_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "classe_som_nome_key" ON "classe_som"("nome");
