ALTER TABLE "ProviderWebhookEvent"
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "lockedUntil" TIMESTAMP(3),
    ADD COLUMN "workerId" TEXT,
    ADD COLUMN "lastError" TEXT;

CREATE INDEX "ProviderWebhookEvent_status_nextAttemptAt_idx" ON "ProviderWebhookEvent"("status", "nextAttemptAt");
