-- AlterTable
ALTER TABLE "Fabric" ADD COLUMN     "materialId" TEXT;

-- AddForeignKey
ALTER TABLE "Fabric" ADD CONSTRAINT "Fabric_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
