-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "hasDimensions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isEdgebanded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StepMaterial" ADD COLUMN     "height" DOUBLE PRECISION,
ADD COLUMN     "isEdgebanded" BOOLEAN,
ADD COLUMN     "length" DOUBLE PRECISION,
ADD COLUMN     "width" DOUBLE PRECISION;
