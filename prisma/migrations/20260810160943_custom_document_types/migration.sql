/*
  Warnings:

  - A unique constraint covering the columns `[businessId,key]` on the table `DocumentType` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "DocumentType_key_key";

-- AlterTable
ALTER TABLE "DocumentType" ADD COLUMN     "businessId" INTEGER,
ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_businessId_key_key" ON "DocumentType"("businessId", "key");

-- PostgreSQL treats NULLs as distinct in a composite unique index, so retain
-- unique keys for future system-owned document types with a partial index.
CREATE UNIQUE INDEX "DocumentType_global_key_key"
ON "DocumentType"("key")
WHERE "businessId" IS NULL;

ALTER TABLE "DocumentType" ADD CONSTRAINT "DocumentType_business_ownership_check" CHECK (
    ("isCustom" = false AND "businessId" IS NULL) OR
    ("isCustom" = true AND "businessId" IS NOT NULL)
);
-- AddForeignKey
ALTER TABLE "DocumentType" ADD CONSTRAINT "DocumentType_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
