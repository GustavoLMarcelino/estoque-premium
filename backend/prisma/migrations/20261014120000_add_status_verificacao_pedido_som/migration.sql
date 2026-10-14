-- AlterTable
ALTER TABLE "pedido_som" ADD COLUMN "data_verificacao" DATETIME;
ALTER TABLE "pedido_som" ADD COLUMN "status_verificacao" TEXT;
ALTER TABLE "pedido_som" ADD COLUMN "verificado_por" TEXT;
ALTER TABLE "pedido_som" ADD COLUMN "verificado_por_user_id" INTEGER;

-- CreateIndex
CREATE INDEX "idx_pedido_som_status_verificacao" ON "pedido_som"("status_verificacao");
