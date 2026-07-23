ALTER TABLE "Lead" ADD COLUMN "conversationId" INTEGER;

CREATE INDEX "Lead_conversationId_idx" ON "Lead"("conversationId");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
