CREATE TYPE "ProviderWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

CREATE TABLE "ProviderWebhookEvent" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "integrationConnectionId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ProviderWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "failureCode" TEXT,
    "failureDetail" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "ProviderWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderWebhookEvent_integrationConnectionId_providerEventId_key" ON "ProviderWebhookEvent"("integrationConnectionId", "providerEventId");
CREATE INDEX "ProviderWebhookEvent_businessId_status_receivedAt_idx" ON "ProviderWebhookEvent"("businessId", "status", "receivedAt");
ALTER TABLE "ProviderWebhookEvent" ADD CONSTRAINT "ProviderWebhookEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderWebhookEvent" ADD CONSTRAINT "ProviderWebhookEvent_integrationConnectionId_fkey" FOREIGN KEY ("integrationConnectionId") REFERENCES "IntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
