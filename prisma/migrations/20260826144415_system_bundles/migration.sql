-- DropForeignKey
ALTER TABLE "DocumentBundle" DROP CONSTRAINT "DocumentBundle_businessId_fkey";

-- AlterTable
ALTER TABLE "DocumentBundle" ALTER COLUMN "isCustom" SET DEFAULT false;

-- AddForeignKey
ALTER TABLE "DocumentBundle" ADD CONSTRAINT "DocumentBundle_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
