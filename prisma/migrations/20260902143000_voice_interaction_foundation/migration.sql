CREATE TYPE "VoiceInteractionStatus" AS ENUM ('PENDING', 'SUBMITTING', 'ACCEPTED', 'FAILED', 'UNKNOWN');

CREATE TABLE "VoiceInteraction" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "caseId" INTEGER NOT NULL,
    "caseFollowUpId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerInteractionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "VoiceInteractionStatus" NOT NULL DEFAULT 'PENDING',
    "providerStatus" TEXT,
    "outboundNumberId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VoiceInteraction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoiceInteraction_caseFollowUpId_key" ON "VoiceInteraction"("caseFollowUpId");
CREATE UNIQUE INDEX "VoiceInteraction_idempotencyKey_key" ON "VoiceInteraction"("idempotencyKey");
CREATE UNIQUE INDEX "VoiceInteraction_provider_providerInteractionId_key" ON "VoiceInteraction"("provider", "providerInteractionId");
CREATE INDEX "VoiceInteraction_businessId_status_createdAt_idx" ON "VoiceInteraction"("businessId", "status", "createdAt");
CREATE INDEX "VoiceInteraction_caseId_createdAt_idx" ON "VoiceInteraction"("caseId", "createdAt");

ALTER TABLE "VoiceInteraction" ADD CONSTRAINT "VoiceInteraction_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoiceInteraction" ADD CONSTRAINT "VoiceInteraction_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceInteraction" ADD CONSTRAINT "VoiceInteraction_caseFollowUpId_fkey"
FOREIGN KEY ("caseFollowUpId") REFERENCES "CaseFollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
