-- DropIndex
DROP INDEX "StepMaterial_productionStepId_materialId_key";

-- CreateIndex
CREATE INDEX "StepMaterial_productionStepId_materialId_idx" ON "StepMaterial"("productionStepId", "materialId");
