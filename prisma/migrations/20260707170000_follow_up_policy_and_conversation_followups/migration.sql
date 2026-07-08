-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED', 'CANCELED');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "followUpCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastBotMessageAt" TIMESTAMP(3),
ADD COLUMN     "lastFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "lastUserMessageAt" TIMESTAMP(3),
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BusinessFollowUpPolicy" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "delayMinutes" INTEGER NOT NULL DEFAULT 1440,
    "allowedStartHour" INTEGER,
    "allowedEndHour" INTEGER,
    "maxFollowUps" INTEGER NOT NULL DEFAULT 1,
    "messageTemplate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessFollowUpPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationFollowUp" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "skippedReason" TEXT,
    "messageBody" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessFollowUpPolicy_businessId_key" ON "BusinessFollowUpPolicy"("businessId");

-- CreateIndex
CREATE INDEX "ConversationFollowUp_businessId_status_scheduledFor_idx" ON "ConversationFollowUp"("businessId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "ConversationFollowUp_conversationId_createdAt_idx" ON "ConversationFollowUp"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationFollowUp_createdAt_idx" ON "ConversationFollowUp"("createdAt");

-- AddForeignKey
ALTER TABLE "BusinessFollowUpPolicy" ADD CONSTRAINT "BusinessFollowUpPolicy_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationFollowUp" ADD CONSTRAINT "ConversationFollowUp_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationFollowUp" ADD CONSTRAINT "ConversationFollowUp_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationFollowUp" ADD CONSTRAINT "ConversationFollowUp_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
