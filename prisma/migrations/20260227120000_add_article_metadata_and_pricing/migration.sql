-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "code" TEXT,
ADD COLUMN     "type" TEXT,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "inactive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currency" TEXT DEFAULT 'BAM',
ADD COLUMN     "priceWithoutVAT" DOUBLE PRECISION,
ADD COLUMN     "taxPercentage" DOUBLE PRECISION DEFAULT 17.0;

-- CreateIndex
CREATE UNIQUE INDEX "Article_code_key" ON "Article"("code");
