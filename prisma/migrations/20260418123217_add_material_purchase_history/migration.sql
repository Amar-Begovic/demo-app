-- CreateTable
CREATE TABLE "MaterialPurchaseHistory" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "supplierId" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "purchasePrice" DOUBLE PRECISION NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialPurchaseHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialPurchaseHistory_materialId_purchaseDate_idx" ON "MaterialPurchaseHistory"("materialId", "purchaseDate");

-- CreateIndex
CREATE INDEX "MaterialPurchaseHistory_supplierId_idx" ON "MaterialPurchaseHistory"("supplierId");

-- AddForeignKey
ALTER TABLE "MaterialPurchaseHistory" ADD CONSTRAINT "MaterialPurchaseHistory_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialPurchaseHistory" ADD CONSTRAINT "MaterialPurchaseHistory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
