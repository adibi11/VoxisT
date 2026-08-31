ALTER TABLE "BusinessChannel"
ADD COLUMN "messagingServiceSid" TEXT,
ADD COLUMN "alphaSenderSid" TEXT;

CREATE UNIQUE INDEX "BusinessChannel_messagingServiceSid_key"
ON "BusinessChannel"("messagingServiceSid");
