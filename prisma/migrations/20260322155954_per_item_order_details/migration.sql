/*
  Warnings:

  - You are about to drop the column `customerOrderNumber` on the `ProductionOrder` table. All the data in the column will be lost.
  - You are about to drop the column `deliveryDeadline` on the `ProductionOrder` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `ProductionOrder` table. All the data in the column will be lost.
  - You are about to drop the column `priority` on the `ProductionOrder` table. All the data in the column will be lost.

*/
-- Delete all existing orders and related data before schema changes
DELETE FROM "Barcode";
DELETE FROM "WorkOrder";
DELETE FROM "PurchaseOrder";
DELETE FROM "ProductionOrderItem";
DELETE FROM "ProductionOrder";

-- AlterTable
ALTER TABLE "ProductionOrder" DROP COLUMN "customerOrderNumber",
DROP COLUMN "deliveryDeadline",
DROP COLUMN "notes",
DROP COLUMN "priority";

-- AlterTable
ALTER TABLE "ProductionOrderItem" ADD COLUMN     "customerOrderNumber" TEXT,
ADD COLUMN     "deliveryDeadline" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "priority" "OrderPriority" NOT NULL DEFAULT 'normal';
