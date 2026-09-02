ALTER TABLE "CaseFollowUp"
ADD COLUMN "processingLeaseId" TEXT,
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "dispatchStartedAt" TIMESTAMP(3);

CREATE INDEX "CaseFollowUp_status_leaseExpiresAt_idx"
ON "CaseFollowUp"("status", "leaseExpiresAt");
