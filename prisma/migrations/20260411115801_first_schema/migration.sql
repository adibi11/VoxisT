/*
  Warnings:

  - Added the required column `conversationId` to the `Message` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `status` on the `Message` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('received', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('done', 'middle', 'start', 'failed');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "conversationId" INTEGER NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "MessageStatus" NOT NULL;

-- CreateTable
CREATE TABLE "Conversation" (
    "id" SERIAL NOT NULL,
    "stage" TEXT NOT NULL,
    "conclusion" TEXT,
    "conversationStatus" "ConversationStatus" NOT NULL,
    "businessId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" SERIAL NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessPhone" TEXT NOT NULL,
    "businessEmail" TEXT NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "phoneNumber" TEXT NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
