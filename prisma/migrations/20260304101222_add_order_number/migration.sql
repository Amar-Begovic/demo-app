/*
  Warnings:

  - You are about to drop the `ArticlePartMaterial` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[code]` on the table `Material` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orderNumber]` on the table `ProductionOrder` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "OrderPriority" AS ENUM ('urgent', 'normal', 'low');

-- CreateEnum
CREATE TYPE "StockChangeType" AS ENUM ('inflow', 'outflow', 'adjustment');

-- DropForeignKey
ALTER TABLE "ArticlePartMaterial" DROP CONSTRAINT "ArticlePartMaterial_articlePartId_fkey";

-- DropForeignKey
ALTER TABLE "ArticlePartMaterial" DROP CONSTRAINT "ArticlePartMaterial_materialId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionOrder" DROP CONSTRAINT "ProductionOrder_articleId_fkey";

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "code" TEXT,
ADD COLUMN     "price" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "customerOrderNumber" TEXT,
ADD COLUMN     "deliveryDeadline" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "orderNumber" SERIAL NOT NULL,
ADD COLUMN     "priority" "OrderPriority" NOT NULL DEFAULT 'normal',
ALTER COLUMN "articleId" DROP NOT NULL,
ALTER COLUMN "quantity" DROP NOT NULL;

-- DropTable
DROP TABLE "ArticlePartMaterial";

-- CreateTable
CREATE TABLE "Fabric" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fabric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepMaterial" (
    "id" TEXT NOT NULL,
    "productionStepId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "StepMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrderItem" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "fabricId" TEXT,

    CONSTRAINT "ProductionOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "performedBy" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockHistory" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "changeType" "StockChangeType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "previousQuantity" DOUBLE PRECISION NOT NULL,
    "newQuantity" DOUBLE PRECISION NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fabric_code_key" ON "Fabric"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StepMaterial_productionStepId_materialId_key" ON "StepMaterial"("productionStepId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrderItem_productionOrderId_articleId_key" ON "ProductionOrderItem"("productionOrderId", "articleId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "StockHistory_materialId_createdAt_idx" ON "StockHistory"("materialId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_orderNumber_key" ON "ProductionOrder"("orderNumber");

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepMaterial" ADD CONSTRAINT "StepMaterial_productionStepId_fkey" FOREIGN KEY ("productionStepId") REFERENCES "ProductionStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepMaterial" ADD CONSTRAINT "StepMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderItem" ADD CONSTRAINT "ProductionOrderItem_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderItem" ADD CONSTRAINT "ProductionOrderItem_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderItem" ADD CONSTRAINT "ProductionOrderItem_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
