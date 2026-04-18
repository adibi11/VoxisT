/*
  Warnings:

  - You are about to drop the column `stage` on the `Conversation` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[phoneNumber]` on the table `Client` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `type` on the `Message` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('user', 'bot', 'system');

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "stage",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "type",
ADD COLUMN     "type" "MessageType" NOT NULL;

-- CreateTable
CREATE TABLE "BusinessParameter" (
    "id" SERIAL NOT NULL,
    "paramName" TEXT NOT NULL,
    "businessId" INTEGER NOT NULL,

    CONSTRAINT "BusinessParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParameterAnswer" (
    "id" SERIAL NOT NULL,
    "paramAnswer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" INTEGER NOT NULL,
    "paramId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,

    CONSTRAINT "ParameterAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessParameter_businessId_paramName_key" ON "BusinessParameter"("businessId", "paramName");

-- CreateIndex
CREATE INDEX "ParameterAnswer_conversationId_paramId_idx" ON "ParameterAnswer"("conversationId", "paramId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_phoneNumber_key" ON "Client"("phoneNumber");

-- AddForeignKey
ALTER TABLE "BusinessParameter" ADD CONSTRAINT "BusinessParameter_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParameterAnswer" ADD CONSTRAINT "ParameterAnswer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParameterAnswer" ADD CONSTRAINT "ParameterAnswer_paramId_fkey" FOREIGN KEY ("paramId") REFERENCES "BusinessParameter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParameterAnswer" ADD CONSTRAINT "ParameterAnswer_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
