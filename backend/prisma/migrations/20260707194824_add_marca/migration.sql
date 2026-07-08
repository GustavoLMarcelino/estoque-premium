-- CreateTable
CREATE TABLE "marca" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "estoque" (
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
    CONSTRAINT "estoque_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marca" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "movimentacoes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "produto_id" INTEGER NOT NULL,
    "garantia_id" INTEGER,
    "tipo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "valor_final" DECIMAL NOT NULL,
    "motivo" TEXT,
    "vendedor" TEXT,
    "data_movimentacao" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "created_by" TEXT,
    CONSTRAINT "movimentacoes_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "estoque" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "garantias" (
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
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "descricao_problema" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "garantias_estoque_id_fkey" FOREIGN KEY ("estoque_id") REFERENCES "estoque" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "reset_token" TEXT,
    "reset_token_expira" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "estoque_som" (
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

-- CreateTable
CREATE TABLE "movimentacoes_som" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "produto_id" INTEGER NOT NULL,
    "garantia_id" INTEGER,
    "tipo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "valor_final" DECIMAL NOT NULL,
    "motivo" TEXT,
    "data_movimentacao" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "created_by" TEXT,
    CONSTRAINT "movimentacoes_som_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "estoque_som" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "pedido_som" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "veiculo" TEXT,
    "valor_total" DECIMAL NOT NULL,
    "valor_mao_obra" DECIMAL,
    "comissao_joel" DECIMAL,
    "forma_pagamento" TEXT,
    "user_id" INTEGER,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "pedido_som_item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pedido_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "produto_id" INTEGER,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valor_unit" DECIMAL NOT NULL,
    "valor_total" DECIMAL NOT NULL,
    "baixa_estoque" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "pedido_som_item_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido_som" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "conferencia_estoque" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "linha" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
    "user_id" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizada_at" DATETIME
);

-- CreateTable
CREATE TABLE "conferencia_item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conferencia_id" INTEGER NOT NULL,
    "produto_id" INTEGER NOT NULL,
    "linha" TEXT NOT NULL,
    "qtd_sistema" INTEGER NOT NULL,
    "conferido" BOOLEAN NOT NULL DEFAULT false,
    "conferido_at" DATETIME,
    CONSTRAINT "conferencia_item_conferencia_id_fkey" FOREIGN KEY ("conferencia_id") REFERENCES "conferencia_estoque" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "marca_nome_key" ON "marca"("nome");

-- CreateIndex
CREATE INDEX "idx_estoque_marca" ON "estoque"("marca_id");

-- CreateIndex
CREATE INDEX "fk_produto" ON "movimentacoes"("produto_id");

-- CreateIndex
CREATE INDEX "idx_mov_garantia" ON "movimentacoes"("garantia_id");

-- CreateIndex
CREATE INDEX "idx_mov_motivo" ON "movimentacoes"("motivo");

-- CreateIndex
CREATE INDEX "fk_garantias_estoque" ON "garantias"("estoque_id");

-- CreateIndex
CREATE INDEX "idx_garantias_data_limite" ON "garantias"("data_limite");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "idx_estoque_som_marca" ON "estoque_som"("marca_id");

-- CreateIndex
CREATE INDEX "idx_mov_som_produto" ON "movimentacoes_som"("produto_id");

-- CreateIndex
CREATE INDEX "idx_mov_som_garantia" ON "movimentacoes_som"("garantia_id");

-- CreateIndex
CREATE INDEX "idx_mov_som_motivo" ON "movimentacoes_som"("motivo");

-- CreateIndex
CREATE INDEX "idx_pedido_som_item_pedido" ON "pedido_som_item"("pedido_id");

-- CreateIndex
CREATE INDEX "idx_pedido_som_item_produto" ON "pedido_som_item"("produto_id");

-- CreateIndex
CREATE INDEX "idx_conf_linha" ON "conferencia_estoque"("linha");

-- CreateIndex
CREATE INDEX "idx_conf_status" ON "conferencia_estoque"("status");

-- CreateIndex
CREATE INDEX "idx_conf_user" ON "conferencia_estoque"("user_id");

-- CreateIndex
CREATE INDEX "idx_conf_item_conferencia" ON "conferencia_item"("conferencia_id");

-- CreateIndex
CREATE INDEX "idx_conf_item_produto" ON "conferencia_item"("produto_id");
