-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "normativeVersionId" TEXT;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "normativeVersionStepId" TEXT;

-- CreateTable
CREATE TABLE "NormativeVersion" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NormativeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormativeVersionPart" (
    "id" TEXT NOT NULL,
    "normativeVersionId" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "dimensions" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormativeVersionPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormativeVersionStep" (
    "id" TEXT NOT NULL,
    "normativeVersionPartId" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "departmentId" TEXT NOT NULL,
    "estimatedTime" INTEGER,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormativeVersionStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormativeVersionMaterial" (
    "id" TEXT NOT NULL,
    "normativeVersionStepId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "pieces" DOUBLE PRECISION,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "isEdgebanded" BOOLEAN,

    CONSTRAINT "NormativeVersionMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NormativeVersion_articleId_isActive_idx" ON "NormativeVersion"("articleId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "NormativeVersion_articleId_versionNumber_key" ON "NormativeVersion"("articleId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "NormativeVersionStep_normativeVersionPartId_sequenceOrder_key" ON "NormativeVersionStep"("normativeVersionPartId", "sequenceOrder");

-- CreateIndex
CREATE INDEX "NormativeVersionMaterial_normativeVersionStepId_materialId_idx" ON "NormativeVersionMaterial"("normativeVersionStepId", "materialId");

-- CreateIndex
CREATE INDEX "ProductionOrder_normativeVersionId_idx" ON "ProductionOrder"("normativeVersionId");

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_normativeVersionId_fkey" FOREIGN KEY ("normativeVersionId") REFERENCES "NormativeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_normativeVersionStepId_fkey" FOREIGN KEY ("normativeVersionStepId") REFERENCES "NormativeVersionStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormativeVersion" ADD CONSTRAINT "NormativeVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormativeVersionPart" ADD CONSTRAINT "NormativeVersionPart_normativeVersionId_fkey" FOREIGN KEY ("normativeVersionId") REFERENCES "NormativeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormativeVersionStep" ADD CONSTRAINT "NormativeVersionStep_normativeVersionPartId_fkey" FOREIGN KEY ("normativeVersionPartId") REFERENCES "NormativeVersionPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormativeVersionStep" ADD CONSTRAINT "NormativeVersionStep_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormativeVersionMaterial" ADD CONSTRAINT "NormativeVersionMaterial_normativeVersionStepId_fkey" FOREIGN KEY ("normativeVersionStepId") REFERENCES "NormativeVersionStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormativeVersionMaterial" ADD CONSTRAINT "NormativeVersionMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
