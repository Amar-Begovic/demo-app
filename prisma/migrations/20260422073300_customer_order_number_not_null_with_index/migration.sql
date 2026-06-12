-- Convert existing NULLs to empty string
UPDATE "ProductionOrderItem" SET "customerOrderNumber" = '' WHERE "customerOrderNumber" IS NULL;

-- Make column required with default
ALTER TABLE "ProductionOrderItem" ALTER COLUMN "customerOrderNumber" SET NOT NULL;
ALTER TABLE "ProductionOrderItem" ALTER COLUMN "customerOrderNumber" SET DEFAULT '';

-- Drop old unique index if it exists, replace with regular index
DROP INDEX IF EXISTS "ProductionOrderItem_productionOrderId_articleId_fabricId_key";
DROP INDEX IF EXISTS "ProductionOrderItem_productionOrderId_articleId_fabricId_cust_key";
DROP INDEX IF EXISTS "ProductionOrderItem_productionOrderId_articleId_fabricId_cust_idx";
CREATE INDEX "ProductionOrderItem_productionOrderId_articleId_fabricId_cust_idx" ON "ProductionOrderItem"("productionOrderId", "articleId", "fabricId", "customerOrderNumber");
