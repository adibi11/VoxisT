/*
  Warnings:

  - A unique constraint covering the columns `[appUserId,deviceId]` on the table `PushDevice` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "PhonePlatform" ADD VALUE 'UNKNOWN';

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_appUserId_deviceId_key" ON "PushDevice"("appUserId", "deviceId");
