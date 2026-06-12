-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loadingDate" TIMESTAMP(3);
