-- AlterTable
ALTER TABLE "conferencia_estoque" ADD COLUMN "finalizada_por" TEXT;
ALTER TABLE "conferencia_estoque" ADD COLUMN "finalizada_por_id" INTEGER;
ALTER TABLE "conferencia_estoque" ADD COLUMN "total_conferidos" INTEGER;
ALTER TABLE "conferencia_estoque" ADD COLUMN "total_divergencias" INTEGER;
ALTER TABLE "conferencia_estoque" ADD COLUMN "total_itens" INTEGER;

-- AlterTable
ALTER TABLE "conferencia_item" ADD COLUMN "qtd_contada" INTEGER;

