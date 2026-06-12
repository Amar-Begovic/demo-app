-- CreateIndex
CREATE INDEX "ArticlePart_articleId_idx" ON "ArticlePart"("articleId");

-- CreateIndex
CREATE INDEX "Barcode_productionOrderId_idx" ON "Barcode"("productionOrderId");

-- CreateIndex
CREATE INDEX "Barcode_articlePartId_idx" ON "Barcode"("articlePartId");

-- CreateIndex
CREATE INDEX "ComponentBarcode_articlePartId_idx" ON "ComponentBarcode"("articlePartId");

-- CreateIndex
CREATE INDEX "NormativeVersionPart_normativeVersionId_idx" ON "NormativeVersionPart"("normativeVersionId");

-- CreateIndex
CREATE INDEX "NormativeVersionStep_normativeVersionPartId_idx" ON "NormativeVersionStep"("normativeVersionPartId");

-- CreateIndex
CREATE INDEX "ProductionOrder_articleId_idx" ON "ProductionOrder"("articleId");

-- CreateIndex
CREATE INDEX "ProductionOrderItem_articleId_idx" ON "ProductionOrderItem"("articleId");

-- CreateIndex
CREATE INDEX "ProductionOrderItem_fabricId_idx" ON "ProductionOrderItem"("fabricId");

-- CreateIndex
CREATE INDEX "ProductionOrderItem_serialNumber_idx" ON "ProductionOrderItem"("serialNumber");

-- CreateIndex
CREATE INDEX "WorkOrder_productionOrderId_idx" ON "WorkOrder"("productionOrderId");

-- CreateIndex
CREATE INDEX "WorkOrder_articlePartId_idx" ON "WorkOrder"("articlePartId");

-- CreateIndex
CREATE INDEX "WorkOrder_departmentId_idx" ON "WorkOrder"("departmentId");
