-- CreateTable
CREATE TABLE "BusinessChannel" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "onboardingType" TEXT NOT NULL DEFAULT 'manual',
    "credentialsEncrypted" TEXT,
    "config" JSONB,
    "externalAccountId" TEXT,
    "externalPhoneNumberId" TEXT,
    "webhookUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessChannel_businessId_channel_provider_key" ON "BusinessChannel"("businessId", "channel", "provider");

-- CreateIndex
CREATE INDEX "BusinessChannel_businessId_idx" ON "BusinessChannel"("businessId");

-- CreateIndex
CREATE INDEX "BusinessChannel_businessId_status_idx" ON "BusinessChannel"("businessId", "status");

-- AddForeignKey
ALTER TABLE "BusinessChannel" ADD CONSTRAINT "BusinessChannel_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
