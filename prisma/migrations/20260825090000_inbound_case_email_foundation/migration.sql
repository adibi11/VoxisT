CREATE TYPE "InboundEmailReceiptStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'REJECTED', 'FAILED');
ALTER TABLE "Case" ADD COLUMN "inboundEmailToken" TEXT;
ALTER TABLE "Document" ADD COLUMN "inboundEmailReceiptId" INTEGER, ADD COLUMN "inboundAttachmentIndex" INTEGER;
CREATE TABLE "InboundEmailReceipt" (
  "id" SERIAL NOT NULL, "providerMessageId" TEXT NOT NULL, "rawStorageKey" TEXT NOT NULL,
  "businessId" INTEGER NOT NULL, "caseId" INTEGER NOT NULL,
  "status" "InboundEmailReceiptStatus" NOT NULL DEFAULT 'RECEIVED', "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3), CONSTRAINT "InboundEmailReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Case_inboundEmailToken_key" ON "Case"("inboundEmailToken");
CREATE UNIQUE INDEX "InboundEmailReceipt_providerMessageId_key" ON "InboundEmailReceipt"("providerMessageId");
CREATE UNIQUE INDEX "InboundEmailReceipt_rawStorageKey_key" ON "InboundEmailReceipt"("rawStorageKey");
CREATE INDEX "InboundEmailReceipt_businessId_createdAt_idx" ON "InboundEmailReceipt"("businessId", "createdAt");
CREATE INDEX "InboundEmailReceipt_caseId_createdAt_idx" ON "InboundEmailReceipt"("caseId", "createdAt");
CREATE INDEX "InboundEmailReceipt_status_updatedAt_idx" ON "InboundEmailReceipt"("status", "updatedAt");
CREATE INDEX "Document_inboundEmailReceiptId_idx" ON "Document"("inboundEmailReceiptId");
CREATE UNIQUE INDEX "Document_inboundEmailReceiptId_inboundAttachmentIndex_key" ON "Document"("inboundEmailReceiptId", "inboundAttachmentIndex");
ALTER TABLE "InboundEmailReceipt" ADD CONSTRAINT "InboundEmailReceipt_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InboundEmailReceipt" ADD CONSTRAINT "InboundEmailReceipt_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_inboundEmailReceiptId_fkey" FOREIGN KEY ("inboundEmailReceiptId") REFERENCES "InboundEmailReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
