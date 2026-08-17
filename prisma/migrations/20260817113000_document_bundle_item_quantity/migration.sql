-- AlterTable
ALTER TABLE "DocumentBundleItem" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- AddConstraint
ALTER TABLE "DocumentBundleItem" ADD CONSTRAINT "DocumentBundleItem_quantity_check" CHECK ("quantity" >= 1 AND "quantity" <= 120);