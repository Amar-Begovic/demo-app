/*
  Warnings:

  - A unique constraint covering the columns `[productionOrderId,articleId,fabricId]` on the table `ProductionOrderItem` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ProductionOrderItem_productionOrderId_articleId_key";

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrderItem_productionOrderId_articleId_fabricId_key" ON "ProductionOrderItem"("productionOrderId", "articleId", "fabricId");
