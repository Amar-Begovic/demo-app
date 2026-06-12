-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "productionStepId" TEXT,
ADD COLUMN     "stepSequence" INTEGER;

-- CreateTable
CREATE TABLE "ProductionStep" (
    "id" TEXT NOT NULL,
    "articlePartId" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "departmentId" TEXT NOT NULL,
    "estimatedTime" INTEGER,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionStep_articlePartId_sequenceOrder_key" ON "ProductionStep"("articlePartId", "sequenceOrder");

-- AddForeignKey
ALTER TABLE "ProductionStep" ADD CONSTRAINT "ProductionStep_articlePartId_fkey" FOREIGN KEY ("articlePartId") REFERENCES "ArticlePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionStep" ADD CONSTRAINT "ProductionStep_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_productionStepId_fkey" FOREIGN KEY ("productionStepId") REFERENCES "ProductionStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
