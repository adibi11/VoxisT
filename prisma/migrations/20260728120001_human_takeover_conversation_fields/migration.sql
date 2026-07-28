-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "humanManaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "takenOverByUserId" INTEGER,
ADD COLUMN     "takenOverAt" TIMESTAMP(3),
ADD COLUMN     "releasedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Conversation_businessId_humanManaged_idx" ON "Conversation"("businessId", "humanManaged");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_takenOverByUserId_fkey" FOREIGN KEY ("takenOverByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
