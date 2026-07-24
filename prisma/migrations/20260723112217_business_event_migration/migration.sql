/*
  Warnings:

  - You are about to drop the `TaskActivityEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TaskReminder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TaskTimeEntry` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TaskActivityEvent" DROP CONSTRAINT "TaskActivityEvent_actorUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskActivityEvent" DROP CONSTRAINT "TaskActivityEvent_businessId_fkey";

-- DropForeignKey
ALTER TABLE "TaskActivityEvent" DROP CONSTRAINT "TaskActivityEvent_occurrenceId_fkey";

-- DropForeignKey
ALTER TABLE "TaskActivityEvent" DROP CONSTRAINT "TaskActivityEvent_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskReminder" DROP CONSTRAINT "TaskReminder_businessId_fkey";

-- DropForeignKey
ALTER TABLE "TaskReminder" DROP CONSTRAINT "TaskReminder_cancelledByUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskReminder" DROP CONSTRAINT "TaskReminder_occurrenceId_fkey";

-- DropForeignKey
ALTER TABLE "TaskReminder" DROP CONSTRAINT "TaskReminder_recipientUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskReminder" DROP CONSTRAINT "TaskReminder_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTimeEntry" DROP CONSTRAINT "TaskTimeEntry_businessId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTimeEntry" DROP CONSTRAINT "TaskTimeEntry_deletedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTimeEntry" DROP CONSTRAINT "TaskTimeEntry_occurrenceId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTimeEntry" DROP CONSTRAINT "TaskTimeEntry_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTimeEntry" DROP CONSTRAINT "TaskTimeEntry_userId_fkey";

-- DropTable
DROP TABLE "TaskActivityEvent";

-- DropTable
DROP TABLE "TaskReminder";

-- DropTable
DROP TABLE "TaskTimeEntry";

-- DropEnum
DROP TYPE "TaskActivityEventType";

-- DropEnum
DROP TYPE "TaskReminderReference";

-- DropEnum
DROP TYPE "TaskReminderStatus";

-- RenameIndex
ALTER INDEX "BusinessActivityEvent_businessId_aggregateType_aggregateId_crea" RENAME TO "BusinessActivityEvent_businessId_aggregateType_aggregateId__idx";
