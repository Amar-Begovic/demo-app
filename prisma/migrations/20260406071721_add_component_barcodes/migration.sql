-- CreateTable
CREATE TABLE "ComponentBarcode" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "articlePartId" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComponentBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingScan" (
    "id" TEXT NOT NULL,
    "componentBarcodeId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedBy" TEXT,

    CONSTRAINT "PackagingScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComponentBarcode_value_key" ON "ComponentBarcode"("value");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentBarcode_productionOrderId_articlePartId_componentN_key" ON "ComponentBarcode"("productionOrderId", "articlePartId", "componentName", "itemIndex");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingScan_componentBarcodeId_key" ON "PackagingScan"("componentBarcodeId");

-- AddForeignKey
ALTER TABLE "ComponentBarcode" ADD CONSTRAINT "ComponentBarcode_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentBarcode" ADD CONSTRAINT "ComponentBarcode_articlePartId_fkey" FOREIGN KEY ("articlePartId") REFERENCES "ArticlePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingScan" ADD CONSTRAINT "PackagingScan_componentBarcodeId_fkey" FOREIGN KEY ("componentBarcodeId") REFERENCES "ComponentBarcode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
