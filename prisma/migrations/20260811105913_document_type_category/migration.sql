-- Category replaces key without losing existing DocumentType values.
DROP INDEX IF EXISTS "DocumentType_businessId_key_key";
DROP INDEX IF EXISTS "DocumentType_global_key_key";

ALTER TABLE "DocumentType"
RENAME COLUMN "key" TO "category";

ALTER TABLE "DocumentType"
ALTER COLUMN "category" DROP NOT NULL;
