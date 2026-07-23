-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_businessId_leadId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_cancelledByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_completedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_deletedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskActivityEvent" DROP CONSTRAINT "TaskActivityEvent_actorUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskActivityEvent" DROP CONSTRAINT "TaskActivityEvent_businessId_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskActivityEvent" DROP CONSTRAINT "TaskActivityEvent_commentId_fkey";

-- DropForeignKey
ALTER TABLE "TaskActivityEvent" DROP CONSTRAINT "TaskActivityEvent_occurrenceId_fkey";

-- DropForeignKey
ALTER TABLE "TaskComment" DROP CONSTRAINT "TaskComment_businessId_authorUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskComment" DROP CONSTRAINT "TaskComment_businessId_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskComment" DROP CONSTRAINT "TaskComment_deletedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskOccurrence" DROP CONSTRAINT "TaskOccurrence_assigneeUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskOccurrence" DROP CONSTRAINT "TaskOccurrence_businessId_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskOccurrence" DROP CONSTRAINT "TaskOccurrence_cancelledByUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskOccurrence" DROP CONSTRAINT "TaskOccurrence_completedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskParticipant" DROP CONSTRAINT "TaskParticipant_addedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskParticipant" DROP CONSTRAINT "TaskParticipant_businessId_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskParticipant" DROP CONSTRAINT "TaskParticipant_businessId_userId_fkey";

-- DropForeignKey
ALTER TABLE "TaskParticipant" DROP CONSTRAINT "TaskParticipant_removedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskReminder" DROP CONSTRAINT "TaskReminder_businessId_recipientUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskReminder" DROP CONSTRAINT "TaskReminder_businessId_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskReminder" DROP CONSTRAINT "TaskReminder_cancelledByUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskReminder" DROP CONSTRAINT "TaskReminder_occurrenceId_fkey";

-- DropForeignKey
ALTER TABLE "TaskReminder" DROP CONSTRAINT "TaskReminder_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskSchedule" DROP CONSTRAINT "TaskSchedule_businessId_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskSchedule" DROP CONSTRAINT "TaskSchedule_deactivatedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTimeEntry" DROP CONSTRAINT "TaskTimeEntry_businessId_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTimeEntry" DROP CONSTRAINT "TaskTimeEntry_businessId_userId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTimeEntry" DROP CONSTRAINT "TaskTimeEntry_deletedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "TaskTimeEntry" DROP CONSTRAINT "TaskTimeEntry_occurrenceId_fkey";

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSchedule" ADD CONSTRAINT "TaskSchedule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSchedule" ADD CONSTRAINT "TaskSchedule_deactivatedByUserId_fkey" FOREIGN KEY ("deactivatedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "TaskOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "TaskOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivityEvent" ADD CONSTRAINT "TaskActivityEvent_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "TaskOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivityEvent" ADD CONSTRAINT "TaskActivityEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivityEvent" ADD CONSTRAINT "TaskActivityEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
