-- DropIndex
DROP INDEX "idx_comissao_periodo_inicio";

-- CreateIndex
CREATE UNIQUE INDEX "uq_comissao_periodo_inicio" ON "comissao_periodo"("data_inicio");
