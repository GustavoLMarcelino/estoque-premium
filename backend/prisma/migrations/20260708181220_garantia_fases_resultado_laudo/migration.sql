-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_garantias" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cliente_nome" TEXT NOT NULL,
    "cliente_documento" TEXT NOT NULL,
    "cliente_telefone" TEXT NOT NULL,
    "cliente_endereco" TEXT NOT NULL,
    "produto_codigo" TEXT NOT NULL,
    "produto_descricao" TEXT NOT NULL,
    "estoque_id" INTEGER,
    "data_abertura" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_limite" DATETIME,
    "data_contato" DATETIME,
    "data_compra" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_ENVIO',
    "descricao_problema" TEXT,
    "resultado" TEXT,
    "laudo" TEXT,
    "emprestimo_produto_id" INTEGER,
    "emprestimo_quantidade" INTEGER,
    "emprestimo_devolvido" BOOLEAN NOT NULL DEFAULT false,
    "emprestimo_devolvido_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "garantias_estoque_id_fkey" FOREIGN KEY ("estoque_id") REFERENCES "estoque" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_garantias" ("cliente_documento", "cliente_endereco", "cliente_nome", "cliente_telefone", "created_at", "data_abertura", "data_compra", "data_contato", "data_limite", "descricao_problema", "emprestimo_devolvido", "emprestimo_devolvido_at", "emprestimo_produto_id", "emprestimo_quantidade", "estoque_id", "id", "produto_codigo", "produto_descricao", "status", "updated_at") SELECT "cliente_documento", "cliente_endereco", "cliente_nome", "cliente_telefone", "created_at", "data_abertura", "data_compra", "data_contato", "data_limite", "descricao_problema", "emprestimo_devolvido", "emprestimo_devolvido_at", "emprestimo_produto_id", "emprestimo_quantidade", "estoque_id", "id", "produto_codigo", "produto_descricao", "status", "updated_at" FROM "garantias";
DROP TABLE "garantias";
ALTER TABLE "new_garantias" RENAME TO "garantias";
CREATE INDEX "fk_garantias_estoque" ON "garantias"("estoque_id");
CREATE INDEX "idx_garantias_data_limite" ON "garantias"("data_limite");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
