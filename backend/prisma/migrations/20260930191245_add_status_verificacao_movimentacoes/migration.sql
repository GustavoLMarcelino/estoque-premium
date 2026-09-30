-- AlterTable
ALTER TABLE "movimentacoes" ADD COLUMN "data_verificacao" DATETIME;
ALTER TABLE "movimentacoes" ADD COLUMN "status_verificacao" TEXT;
ALTER TABLE "movimentacoes" ADD COLUMN "verificado_por" TEXT;
ALTER TABLE "movimentacoes" ADD COLUMN "verificado_por_user_id" INTEGER;

-- CreateIndex
CREATE INDEX "idx_mov_data" ON "movimentacoes"("data_movimentacao");

-- CreateIndex
CREATE INDEX "idx_mov_status_verificacao" ON "movimentacoes"("status_verificacao");
