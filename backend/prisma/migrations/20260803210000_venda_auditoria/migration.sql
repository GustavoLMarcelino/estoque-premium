-- CreateTable
CREATE TABLE "venda_auditoria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "linha" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" INTEGER NOT NULL,
    "acao" TEXT NOT NULL,
    "conteudo_anterior" TEXT NOT NULL,
    "user_id" INTEGER,
    "feito_por" TEXT,
    "feito_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "idx_venda_auditoria_entidade" ON "venda_auditoria"("entidade", "entidade_id");
