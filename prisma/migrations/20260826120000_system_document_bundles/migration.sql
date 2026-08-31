ALTER TABLE "DocumentBundle"
ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "businessId" DROP NOT NULL;

ALTER TABLE "DocumentBundle"
ADD CONSTRAINT "DocumentBundle_business_ownership_check" CHECK (
  ("isCustom" = false AND "businessId" IS NULL) OR
  ("isCustom" = true AND "businessId" IS NOT NULL)
);
