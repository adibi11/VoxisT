ALTER TABLE "BusinessFollowUpPolicy"
ADD COLUMN "caseDocumentFollowUpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "caseDocumentFollowUpHour" INTEGER;

ALTER TABLE "BusinessFollowUpPolicy"
ADD CONSTRAINT "BusinessFollowUpPolicy_caseDocumentFollowUpHour_check"
CHECK ("caseDocumentFollowUpHour" IS NULL OR ("caseDocumentFollowUpHour" >= 0 AND "caseDocumentFollowUpHour" <= 23));
