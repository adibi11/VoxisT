-- CreateEnum
CREATE TYPE "CaseFollowUpStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACCEPTED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "CaseFollowUp" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "caseId" INTEGER NOT NULL,
    "status" "CaseFollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureReason" TEXT,
    "cadenceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseFollowUp_caseId_cadenceKey_key" ON "CaseFollowUp"("caseId", "cadenceKey");

-- CreateIndex
CREATE INDEX "CaseFollowUp_businessId_status_scheduledFor_idx" ON "CaseFollowUp"("businessId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "CaseFollowUp_caseId_createdAt_idx" ON "CaseFollowUp"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "CaseFollowUp" ADD CONSTRAINT "CaseFollowUp_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseFollowUp" ADD CONSTRAINT "CaseFollowUp_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
