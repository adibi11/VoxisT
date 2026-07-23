ALTER TABLE "TaskSchedule" ADD COLUMN "nextNotificationAt" TIMESTAMP(3);
CREATE INDEX "TaskSchedule_businessId_isActive_nextNotificationAt_idx"
  ON "TaskSchedule"("businessId", "isActive", "nextNotificationAt");
