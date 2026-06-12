-- AlterTable
ALTER TABLE "ProductionOrderItem" ADD COLUMN     "nogice1Id" TEXT,
ADD COLUMN     "nogice2Id" TEXT,
ADD COLUMN     "paspulId" TEXT,
ADD COLUMN     "ruckaId" TEXT;

-- AddForeignKey
ALTER TABLE "ProductionOrderItem" ADD CONSTRAINT "ProductionOrderItem_ruckaId_fkey" FOREIGN KEY ("ruckaId") REFERENCES "Rucka"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderItem" ADD CONSTRAINT "ProductionOrderItem_paspulId_fkey" FOREIGN KEY ("paspulId") REFERENCES "Paspul"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderItem" ADD CONSTRAINT "ProductionOrderItem_nogice1Id_fkey" FOREIGN KEY ("nogice1Id") REFERENCES "Nogica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderItem" ADD CONSTRAINT "ProductionOrderItem_nogice2Id_fkey" FOREIGN KEY ("nogice2Id") REFERENCES "Nogica"("id") ON DELETE SET NULL ON UPDATE CASCADE;
