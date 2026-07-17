-- AlterTable
ALTER TABLE "movimentacoes" ADD COLUMN "forma_pagamento" TEXT;
ALTER TABLE "movimentacoes" ADD COLUMN "parcelas" INTEGER;

-- CreateTable
CREATE TABLE "taxas_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pix_pct" DECIMAL NOT NULL,
    "debito_pct" DECIMAL NOT NULL,
    "credito_avista_pct" DECIMAL NOT NULL,
    "credito_2a6_pct" DECIMAL NOT NULL,
    "credito_7a12_pct" DECIMAL NOT NULL,
    "antecipacao_mes_pct" DECIMAL NOT NULL,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT
);
