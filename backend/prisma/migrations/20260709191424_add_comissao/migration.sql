-- CreateTable
CREATE TABLE "comissao_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "valor_bateria" DECIMAL NOT NULL,
    "percentual_mao_obra" DECIMAL NOT NULL,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT
);

-- CreateTable
CREATE TABLE "comissao_periodo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "data_inicio" DATETIME NOT NULL,
    "data_fim" DATETIME NOT NULL,
    "fechado_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "comissao_periodo_item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "periodo_id" INTEGER NOT NULL,
    "vendedor" TEXT NOT NULL,
    "qtd_baterias" INTEGER NOT NULL DEFAULT 0,
    "base_mao_obra" DECIMAL NOT NULL DEFAULT 0,
    "valor_comissao" DECIMAL NOT NULL DEFAULT 0,
    "snap_valor_bateria" DECIMAL NOT NULL,
    "snap_percentual" DECIMAL NOT NULL,
    CONSTRAINT "comissao_periodo_item_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "comissao_periodo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "idx_comissao_periodo_inicio" ON "comissao_periodo"("data_inicio");

-- CreateIndex
CREATE INDEX "idx_comissao_periodo_item_periodo" ON "comissao_periodo_item"("periodo_id");
