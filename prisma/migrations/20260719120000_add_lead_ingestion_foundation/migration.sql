CREATE TYPE "LeadOrigin" AS ENUM ('CAMPAIGN', 'CONVERSATION', 'MANUAL', 'API', 'IMPORT');
CREATE TYPE "IntegrationType" AS ENUM ('LEAD_ADS', 'FORM', 'LANDING_PAGE', 'CUSTOM_API', 'MESSAGING');
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED', 'FAILED');
CREATE TYPE "IncomingLeadStatus" AS ENUM ('RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');
CREATE TYPE "IngestionOutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

ALTER TABLE "Lead" ADD COLUMN "origin" "LeadOrigin" NOT NULL DEFAULT 'MANUAL';

CREATE TABLE "IntegrationConnection" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "integrationType" "IntegrationType" NOT NULL,
    "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "connectionToken" TEXT NOT NULL,
    "displayName" TEXT,
    "externalAccountId" TEXT,
    "externalResourceId" TEXT,
    "credentialsEncrypted" TEXT,
    "webhookSecretEncrypted" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalLead" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "integrationConnectionId" INTEGER NOT NULL,
    "leadId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "externalLeadId" TEXT NOT NULL,
    "externalContactId" TEXT,
    "metadata" JSONB,
    "firstReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncomingLead" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "integrationConnectionId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerEventId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "rawPayload" JSONB,
    "canonicalPayload" JSONB NOT NULL,
    "status" "IncomingLeadStatus" NOT NULL DEFAULT 'RECEIVED',
    "failureCode" TEXT,
    "failureDetail" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "externalLeadId" INTEGER,
    CONSTRAINT "IncomingLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadAttribution" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "provider" TEXT,
    "campaignExternalId" TEXT,
    "campaignName" TEXT,
    "formExternalId" TEXT,
    "formName" TEXT,
    "adExternalId" TEXT,
    "adSetExternalId" TEXT,
    "landingPageUrl" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "referrer" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadAttribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IngestionOutbox" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "IngestionOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IngestionOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationConnection_connectionToken_key" ON "IntegrationConnection"("connectionToken");
CREATE UNIQUE INDEX "IntegrationConnection_businessId_provider_integrationType_externalResourceId_key" ON "IntegrationConnection"("businessId", "provider", "integrationType", "externalResourceId");
CREATE INDEX "IntegrationConnection_businessId_status_idx" ON "IntegrationConnection"("businessId", "status");
CREATE UNIQUE INDEX "ExternalLead_integrationConnectionId_externalLeadId_key" ON "ExternalLead"("integrationConnectionId", "externalLeadId");
CREATE INDEX "ExternalLead_businessId_leadId_idx" ON "ExternalLead"("businessId", "leadId");
CREATE UNIQUE INDEX "IncomingLead_integrationConnectionId_idempotencyKey_key" ON "IncomingLead"("integrationConnectionId", "idempotencyKey");
CREATE INDEX "IncomingLead_businessId_status_receivedAt_idx" ON "IncomingLead"("businessId", "status", "receivedAt");
CREATE INDEX "IncomingLead_externalLeadId_idx" ON "IncomingLead"("externalLeadId");
CREATE INDEX "LeadAttribution_leadId_createdAt_idx" ON "LeadAttribution"("leadId", "createdAt");
CREATE UNIQUE INDEX "IngestionOutbox_aggregateType_aggregateId_eventType_key" ON "IngestionOutbox"("aggregateType", "aggregateId", "eventType");
CREATE INDEX "IngestionOutbox_status_availableAt_idx" ON "IngestionOutbox"("status", "availableAt");

ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExternalLead" ADD CONSTRAINT "ExternalLead_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExternalLead" ADD CONSTRAINT "ExternalLead_integrationConnectionId_fkey" FOREIGN KEY ("integrationConnectionId") REFERENCES "IntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExternalLead" ADD CONSTRAINT "ExternalLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncomingLead" ADD CONSTRAINT "IncomingLead_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncomingLead" ADD CONSTRAINT "IncomingLead_integrationConnectionId_fkey" FOREIGN KEY ("integrationConnectionId") REFERENCES "IntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncomingLead" ADD CONSTRAINT "IncomingLead_externalLeadId_fkey" FOREIGN KEY ("externalLeadId") REFERENCES "ExternalLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadAttribution" ADD CONSTRAINT "LeadAttribution_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IngestionOutbox" ADD CONSTRAINT "IngestionOutbox_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
