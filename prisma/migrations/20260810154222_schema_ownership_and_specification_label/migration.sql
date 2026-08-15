-- DropForeignKey
ALTER TABLE "Schema" DROP CONSTRAINT "Schema_businessId_fkey";

-- AlterTable
ALTER TABLE "CaseDocumentSpecification" ADD COLUMN     "label" TEXT;

-- AlterTable
ALTER TABLE "Schema" ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "businessId" DROP NOT NULL;

-- Enforce the ownership modes: system schemas have no business; custom schemas do.
ALTER TABLE "Schema" ADD CONSTRAINT "Schema_business_ownership_check" CHECK (
    ("isCustom" = false AND "businessId" IS NULL) OR
    ("isCustom" = true AND "businessId" IS NOT NULL)
);

-- AddForeignKey
ALTER TABLE "Schema" ADD CONSTRAINT "Schema_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
