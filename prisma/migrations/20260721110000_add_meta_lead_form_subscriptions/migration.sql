CREATE TYPE "MetaLeadFormSubscriptionStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "MetaLeadFormSubscription" (
    "id" SERIAL NOT NULL,
    "integrationConnectionId" INTEGER NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "formId" TEXT NOT NULL,
    "formName" TEXT,
    "status" "MetaLeadFormSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MetaLeadFormSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaLeadFormSubscription_integrationConnectionId_formId_key" ON "MetaLeadFormSubscription"("integrationConnectionId", "formId");
CREATE INDEX "MetaLeadFormSubscription_pageId_formId_status_idx" ON "MetaLeadFormSubscription"("pageId", "formId", "status");
ALTER TABLE "MetaLeadFormSubscription" ADD CONSTRAINT "MetaLeadFormSubscription_integrationConnectionId_fkey" FOREIGN KEY ("integrationConnectionId") REFERENCES "IntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing one-Page/one-form Meta connections when upgrading to the multi-form model.
INSERT INTO "MetaLeadFormSubscription" ("integrationConnectionId", "pageId", "formId", "status", "createdAt", "updatedAt")
SELECT "id", "config"->>'pageId', "externalResourceId", 'ACTIVE'::"MetaLeadFormSubscriptionStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "IntegrationConnection"
WHERE "provider" = 'meta'
  AND "integrationType" = 'LEAD_ADS'
  AND "externalResourceId" IS NOT NULL
  AND "config"->>'pageId' IS NOT NULL
ON CONFLICT ("integrationConnectionId", "formId") DO NOTHING;

UPDATE "IntegrationConnection"
SET "status" = 'ACTIVE'
WHERE "provider" = 'meta'
  AND "integrationType" = 'LEAD_ADS'
  AND "status" = 'PENDING'
  AND "externalResourceId" IS NOT NULL
  AND "config"->>'pageId' IS NOT NULL;
