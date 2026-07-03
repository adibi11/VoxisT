-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFYING', 'QUALIFIED', 'ASSIGNED', 'FOLLOW_UP', 'WON', 'LOST', 'CLOSED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WHATSAPP', 'MANUAL', 'FACEBOOK', 'GOOGLE_ADS', 'WEBSITE', 'OTHER');

-- AlterEnum
ALTER TYPE "PlatformRole" ADD VALUE 'owner';

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "clientId" INTEGER,
    "memberId" INTEGER,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" "LeadSource" NOT NULL DEFAULT 'WHATSAPP',
    "score" INTEGER,
    "summary" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asignTime" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "followUpAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
