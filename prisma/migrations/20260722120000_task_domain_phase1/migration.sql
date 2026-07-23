CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DELETED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "TaskParticipantRole" AS ENUM ('MAIN_ASSIGNEE', 'LISTENER');
CREATE TYPE "TaskOccurrenceStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'SKIPPED');
CREATE TYPE "TaskReminderReference" AS ENUM ('START', 'DUE');
CREATE TYPE "TaskReminderStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "TaskActivityEventType" AS ENUM (
    'TASK_CREATED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_CANCELLED', 'TASK_DELETED',
    'ASSIGNEE_CHANGED', 'LISTENER_ADDED', 'LISTENER_REMOVED',
    'COMMENT_CREATED', 'COMMENT_EDITED', 'COMMENT_DELETED',
    'SCHEDULE_CREATED', 'SCHEDULE_UPDATED', 'SCHEDULE_DEACTIVATED',
    'OCCURRENCE_CREATED', 'OCCURRENCE_COMPLETED', 'OCCURRENCE_CANCELLED',
    'REMINDER_CREATED', 'REMINDER_CANCELLED',
    'TIME_ENTRY_CREATED', 'TIME_ENTRY_UPDATED', 'TIME_ENTRY_DELETED'
);

ALTER TABLE "BusinessUser" ADD CONSTRAINT "BusinessUser_businessId_userId_key" UNIQUE ("businessId", "userId");
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_id_businessId_key" UNIQUE ("id", "businessId");

CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "leadId" INTEGER,
    "headline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "category" TEXT,
    "startsAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "updatedByUserId" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" INTEGER,
    "cancellationReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" INTEGER,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Task_id_businessId_key" UNIQUE ("id", "businessId"),
    CONSTRAINT "Task_headline_not_blank" CHECK (btrim("headline") <> ''),
    CONSTRAINT "Task_description_not_blank" CHECK (btrim("description") <> ''),
    CONSTRAINT "Task_timezone_not_blank" CHECK (btrim("timezone") <> ''),
    CONSTRAINT "Task_calendar_order" CHECK ("startsAt" IS NULL OR "dueAt" IS NULL OR "dueAt" >= "startsAt"),
    CONSTRAINT "Task_version_positive" CHECK ("version" > 0),
    CONSTRAINT "Task_completed_audit" CHECK ("status" <> 'COMPLETED' OR ("completedAt" IS NOT NULL AND "completedByUserId" IS NOT NULL)),
    CONSTRAINT "Task_cancelled_audit" CHECK ("status" <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL)),
    CONSTRAINT "Task_deleted_audit" CHECK ("status" <> 'DELETED' OR ("deletedAt" IS NOT NULL AND "deletedByUserId" IS NOT NULL))
);

CREATE TABLE "TaskParticipant" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "TaskParticipantRole" NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedByUserId" INTEGER NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedByUserId" INTEGER,
    CONSTRAINT "TaskParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskComment" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "authorUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" INTEGER,
    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaskComment_body_not_blank" CHECK (btrim("body") <> '')
);

CREATE TABLE "TaskSchedule" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "rrule" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "nextOccurrenceAt" TIMESTAMP(3),
    "occurrenceDueOffsetMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "updatedByUserId" INTEGER NOT NULL,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedByUserId" INTEGER,
    CONSTRAINT "TaskSchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaskSchedule_rrule_not_blank" CHECK (btrim("rrule") <> ''),
    CONSTRAINT "TaskSchedule_timezone_not_blank" CHECK (btrim("timezone") <> ''),
    CONSTRAINT "TaskSchedule_boundary_order" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" >= "startsAt"),
    CONSTRAINT "TaskSchedule_due_offset_nonnegative" CHECK ("occurrenceDueOffsetMinutes" IS NULL OR "occurrenceDueOffsetMinutes" >= 0)
);

CREATE TABLE "TaskOccurrence" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "scheduleId" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "TaskOccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "assigneeUserId" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" INTEGER,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskOccurrence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaskOccurrence_scheduleId_scheduledFor_key" UNIQUE ("scheduleId", "scheduledFor"),
    CONSTRAINT "TaskOccurrence_due_order" CHECK ("dueAt" IS NULL OR "dueAt" >= "scheduledFor"),
    CONSTRAINT "TaskOccurrence_completed_audit" CHECK ("status" <> 'COMPLETED' OR ("completedAt" IS NOT NULL AND "completedByUserId" IS NOT NULL)),
    CONSTRAINT "TaskOccurrence_cancelled_audit" CHECK ("status" <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL))
);

CREATE TABLE "TaskReminder" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "taskId" INTEGER,
    "occurrenceId" INTEGER,
    "recipientUserId" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "reference" "TaskReminderReference" NOT NULL DEFAULT 'START',
    "offsetMinutes" INTEGER,
    "status" "TaskReminderStatus" NOT NULL DEFAULT 'PENDING',
    "reminderKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" INTEGER,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaskReminder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaskReminder_reminderKey_key" UNIQUE ("reminderKey"),
    CONSTRAINT "TaskReminder_exactly_one_target" CHECK (("taskId" IS NULL) <> ("occurrenceId" IS NULL)),
    CONSTRAINT "TaskReminder_offset_nonnegative" CHECK ("offsetMinutes" IS NULL OR "offsetMinutes" >= 0),
    CONSTRAINT "TaskReminder_attempts_nonnegative" CHECK ("attempts" >= 0),
    CONSTRAINT "TaskReminder_cancelled_audit" CHECK ("status" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
);

CREATE TABLE "TaskTimeEntry" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "occurrenceId" INTEGER,
    "userId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" INTEGER,
    CONSTRAINT "TaskTimeEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaskTimeEntry_valid_measurement" CHECK (
        ("startedAt" IS NOT NULL AND "endedAt" IS NOT NULL AND "durationSeconds" IS NULL AND "endedAt" >= "startedAt")
        OR ("startedAt" IS NULL AND "endedAt" IS NULL AND "durationSeconds" IS NOT NULL AND "durationSeconds" > 0)
    )
);

CREATE TABLE "TaskActivityEvent" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "occurrenceId" INTEGER,
    "commentId" INTEGER,
    "actorUserId" INTEGER,
    "eventType" "TaskActivityEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Task_businessId_status_dueAt_idx" ON "Task"("businessId", "status", "dueAt");
CREATE INDEX "Task_businessId_leadId_idx" ON "Task"("businessId", "leadId");
CREATE INDEX "Task_businessId_deletedAt_updatedAt_idx" ON "Task"("businessId", "deletedAt", "updatedAt");
CREATE INDEX "TaskParticipant_businessId_idx" ON "TaskParticipant"("businessId");
CREATE INDEX "TaskParticipant_taskId_idx" ON "TaskParticipant"("taskId");
CREATE UNIQUE INDEX "TaskParticipant_one_active_main_assignee" ON "TaskParticipant"("taskId") WHERE "role" = 'MAIN_ASSIGNEE' AND "removedAt" IS NULL;
CREATE UNIQUE INDEX "TaskParticipant_one_active_membership" ON "TaskParticipant"("taskId", "userId") WHERE "removedAt" IS NULL;
CREATE INDEX "TaskComment_businessId_idx" ON "TaskComment"("businessId");
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");
CREATE UNIQUE INDEX "TaskSchedule_one_active_schedule" ON "TaskSchedule"("taskId") WHERE "isActive" = true;
CREATE INDEX "TaskSchedule_businessId_isActive_nextOccurrenceAt_idx" ON "TaskSchedule"("businessId", "isActive", "nextOccurrenceAt");
CREATE INDEX "TaskSchedule_taskId_idx" ON "TaskSchedule"("taskId");
CREATE INDEX "TaskOccurrence_businessId_status_dueAt_idx" ON "TaskOccurrence"("businessId", "status", "dueAt");
CREATE INDEX "TaskOccurrence_taskId_idx" ON "TaskOccurrence"("taskId");
CREATE INDEX "TaskReminder_businessId_status_scheduledAt_idx" ON "TaskReminder"("businessId", "status", "scheduledAt");
CREATE INDEX "TaskReminder_taskId_idx" ON "TaskReminder"("taskId");
CREATE INDEX "TaskReminder_occurrenceId_idx" ON "TaskReminder"("occurrenceId");
CREATE INDEX "TaskTimeEntry_taskId_userId_startedAt_idx" ON "TaskTimeEntry"("taskId", "userId", "startedAt");
CREATE INDEX "TaskTimeEntry_businessId_idx" ON "TaskTimeEntry"("businessId");
CREATE INDEX "TaskActivityEvent_taskId_createdAt_idx" ON "TaskActivityEvent"("taskId", "createdAt");
CREATE INDEX "TaskActivityEvent_businessId_createdAt_idx" ON "TaskActivityEvent"("businessId", "createdAt");

ALTER TABLE "Task" ADD CONSTRAINT "Task_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_businessId_leadId_fkey" FOREIGN KEY ("businessId", "leadId") REFERENCES "Lead"("businessId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_businessId_taskId_fkey" FOREIGN KEY ("businessId", "taskId") REFERENCES "Task"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_businessId_userId_fkey" FOREIGN KEY ("businessId", "userId") REFERENCES "BusinessUser"("businessId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_businessId_taskId_fkey" FOREIGN KEY ("businessId", "taskId") REFERENCES "Task"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_businessId_authorUserId_fkey" FOREIGN KEY ("businessId", "authorUserId") REFERENCES "BusinessUser"("businessId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskSchedule" ADD CONSTRAINT "TaskSchedule_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskSchedule" ADD CONSTRAINT "TaskSchedule_businessId_taskId_fkey" FOREIGN KEY ("businessId", "taskId") REFERENCES "Task"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskSchedule" ADD CONSTRAINT "TaskSchedule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskSchedule" ADD CONSTRAINT "TaskSchedule_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskSchedule" ADD CONSTRAINT "TaskSchedule_deactivatedByUserId_fkey" FOREIGN KEY ("deactivatedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "TaskSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_businessId_taskId_fkey" FOREIGN KEY ("businessId", "taskId") REFERENCES "Task"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_assigneeUserId_fkey" FOREIGN KEY ("businessId", "assigneeUserId") REFERENCES "BusinessUser"("businessId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "TaskOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_businessId_taskId_fkey" FOREIGN KEY ("businessId", "taskId") REFERENCES "Task"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_businessId_recipientUserId_fkey" FOREIGN KEY ("businessId", "recipientUserId") REFERENCES "BusinessUser"("businessId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "TaskOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_businessId_taskId_fkey" FOREIGN KEY ("businessId", "taskId") REFERENCES "Task"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_businessId_userId_fkey" FOREIGN KEY ("businessId", "userId") REFERENCES "BusinessUser"("businessId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaskActivityEvent" ADD CONSTRAINT "TaskActivityEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskActivityEvent" ADD CONSTRAINT "TaskActivityEvent_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "TaskOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskActivityEvent" ADD CONSTRAINT "TaskActivityEvent_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskActivityEvent" ADD CONSTRAINT "TaskActivityEvent_businessId_taskId_fkey" FOREIGN KEY ("businessId", "taskId") REFERENCES "Task"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskActivityEvent" ADD CONSTRAINT "TaskActivityEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "assert_task_has_exactly_one_main_assignee"("checkedTaskId" INTEGER)
RETURNS VOID AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Task" t
        WHERE t."id" = "checkedTaskId"
          AND 1 <> (
              SELECT COUNT(*)
              FROM "TaskParticipant" p
              WHERE p."taskId" = t."id"
                AND p."role" = 'MAIN_ASSIGNEE'
                AND p."removedAt" IS NULL
          )
    ) THEN
        RAISE EXCEPTION 'Task % must have exactly one active main assignee', "checkedTaskId";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "check_task_main_assignee_from_task"()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM "assert_task_has_exactly_one_main_assignee"(NEW."id");
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "check_task_main_assignee_from_participant"()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM "assert_task_has_exactly_one_main_assignee"(COALESCE(NEW."taskId", OLD."taskId"));
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "Task_exactly_one_main_assignee"
AFTER INSERT OR UPDATE ON "Task"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "check_task_main_assignee_from_task"();

CREATE CONSTRAINT TRIGGER "TaskParticipant_exactly_one_main_assignee"
AFTER INSERT OR UPDATE OR DELETE ON "TaskParticipant"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "check_task_main_assignee_from_participant"();
