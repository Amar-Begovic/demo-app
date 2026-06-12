/*
  Warnings:

  - A unique constraint covering the columns `[productionOrderId,articlePartId,itemIndex,type]` on the table `Barcode` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "BarcodeType" ADD VALUE 'part_identifier';

-- AlterTable
ALTER TABLE "Barcode" ADD COLUMN     "articlePartId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_productionOrderId_articlePartId_itemIndex_type_key" ON "Barcode"("productionOrderId", "articlePartId", "itemIndex", "type");

-- AddForeignKey
ALTER TABLE "Barcode" ADD CONSTRAINT "Barcode_articlePartId_fkey" FOREIGN KEY ("articlePartId") REFERENCES "ArticlePart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
