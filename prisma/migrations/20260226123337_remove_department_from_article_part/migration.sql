/*
  Warnings:

  - You are about to drop the column `departmentId` on the `ArticlePart` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ArticlePart" DROP CONSTRAINT "ArticlePart_departmentId_fkey";

-- AlterTable
ALTER TABLE "ArticlePart" DROP COLUMN "departmentId";
