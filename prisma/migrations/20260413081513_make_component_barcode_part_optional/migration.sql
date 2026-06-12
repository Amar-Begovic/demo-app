/*
  Warnings:

  - A unique constraint covering the columns `[productionOrderId,componentName,itemIndex]` on the table `ComponentBarcode` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ComponentBarcode_productionOrderId_articlePartId_componentN_key";

-- AlterTable
ALTER TABLE "ComponentBarcode" ALTER COLUMN "articlePartId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ComponentBarcode_productionOrderId_componentName_itemIndex_key" ON "ComponentBarcode"("productionOrderId", "componentName", "itemIndex");
