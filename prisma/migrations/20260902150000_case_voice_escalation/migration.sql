ALTER TABLE "BusinessFollowUpPolicy"
ADD COLUMN "caseDocumentVoiceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "caseDocumentVoiceThresholdDays" INTEGER;

ALTER TABLE "BusinessFollowUpPolicy"
ADD CONSTRAINT "BusinessFollowUpPolicy_caseDocumentVoiceThresholdDays_check"
CHECK (
  "caseDocumentVoiceThresholdDays" IS NULL
  OR "caseDocumentVoiceThresholdDays" >= 1
);

ALTER TABLE "Case"
ADD COLUMN "lastBorrowerInteractionAt" TIMESTAMP(3);

ALTER TABLE "CaseFollowUp"
ADD COLUMN "dispatchChannel" TEXT,
ADD COLUMN "dispatchProvider" TEXT;
