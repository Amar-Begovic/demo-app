-- CreateTable
CREATE TABLE "Leg" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "color" TEXT,
    "description" TEXT,
    "materialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Leg_code_key" ON "Leg"("code");

-- AddForeignKey
ALTER TABLE "Leg" ADD CONSTRAINT "Leg_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ProductionOrderItem" ADD COLUMN "legId" TEXT;

-- CreateIndex
CREATE INDEX "ProductionOrderItem_legId_idx" ON "ProductionOrderItem"("legId");

-- AddForeignKey
ALTER TABLE "ProductionOrderItem" ADD CONSTRAINT "ProductionOrderItem_legId_fkey" FOREIGN KEY ("legId") REFERENCES "Leg"("id") ON DELETE SET NULL ON UPDATE CASCADE;
