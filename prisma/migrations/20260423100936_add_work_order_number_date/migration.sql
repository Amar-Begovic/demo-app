-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "workOrderDate" TIMESTAMP(3),
ADD COLUMN     "workOrderNumber" TEXT;

-- RenameIndex
ALTER INDEX "ProductionOrderItem_productionOrderId_articleId_fabricId_cust_i" RENAME TO "ProductionOrderItem_productionOrderId_articleId_fabricId_cu_idx";
