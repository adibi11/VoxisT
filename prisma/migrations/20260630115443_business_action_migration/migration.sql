-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('BOOK_APPOINTMENT', 'SEND_PAYMENT_LINK', 'SEND_VIDEO', 'HUMAN_HANDOFF', 'SEND_EMAIL', 'NONE');

-- CreateTable
CREATE TABLE "BusinessAction" (
    "id" SERIAL NOT NULL,
    "provider" TEXT,
    "config" JSONB,
    "businessId" INTEGER NOT NULL,

    CONSTRAINT "BusinessAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessAction_businessId_key" ON "BusinessAction"("businessId");

-- AddForeignKey
ALTER TABLE "BusinessAction" ADD CONSTRAINT "BusinessAction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
