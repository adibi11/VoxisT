/*
  Warnings:

  - The values [done,middle,failed] on the enum `ConversationStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ConversationStatus_new" AS ENUM ('start', 'collecting', 'pacing', 'closing', 'failure', 'ended', 'scheduling', 'schedulingConfirmed', 'schedulingFailed');
ALTER TABLE "Conversation" ALTER COLUMN "conversationStatus" TYPE "ConversationStatus_new" USING ("conversationStatus"::text::"ConversationStatus_new");
ALTER TYPE "ConversationStatus" RENAME TO "ConversationStatus_old";
ALTER TYPE "ConversationStatus_new" RENAME TO "ConversationStatus";
DROP TYPE "public"."ConversationStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "messageIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BusinessContext" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "profileName" TEXT NOT NULL,
    "profileLanguage" TEXT NOT NULL,
    "profileTone" TEXT NOT NULL,
    "description" TEXT,
    "serviceCatalog" JSONB NOT NULL,
    "conversationPolicy" JSONB NOT NULL,
    "knownClientContext" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessContext_businessId_key" ON "BusinessContext"("businessId");

-- CreateIndex
CREATE INDEX "Message_conversationId_messageIndex_idx" ON "Message"("conversationId", "messageIndex");

-- AddForeignKey
ALTER TABLE "BusinessContext" ADD CONSTRAINT "BusinessContext_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
