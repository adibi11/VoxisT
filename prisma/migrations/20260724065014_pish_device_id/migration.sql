/*
  Warnings:

  - Added the required column `deviceId` to the `PushDevice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PushDevice" ADD COLUMN     "deviceId" TEXT NOT NULL;
