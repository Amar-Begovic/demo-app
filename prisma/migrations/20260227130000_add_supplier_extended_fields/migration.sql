-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "code" TEXT,
ADD COLUMN     "type" TEXT,
ADD COLUMN     "vatStatus" TEXT,
ADD COLUMN     "vatNumber" TEXT,
ADD COLUMN     "registration" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'Bosna i Hercegovina',
ADD COLUMN     "city" TEXT,
ADD COLUMN     "postalCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");
