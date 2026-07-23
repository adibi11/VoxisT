-- BusinessActivityEvent is notification work.  TaskActivityEvent remains in place
-- for historical timeline data and is intentionally not copied: copied rows would
-- become pending notification work under the current event semantics.

CREATE TYPE "BusinessActivityEventState" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

CREATE TYPE "BusinessActivityEventType" AS ENUM (
    'TASK_CREATED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_CANCELLED', 'TASK_DELETED',
    'ASSIGNEE_CHANGED', 'LISTENER_ADDED', 'LISTENER_REMOVED',
    'COMMENT_CREATED', 'COMMENT_EDITED', 'COMMENT_DELETED',
    'SCHEDULE_CREATED', 'SCHEDULE_UPDATED', 'SCHEDULE_DEACTIVATED',
    'OCCURRENCE_CREATED', 'OCCURRENCE_COMPLETED', 'OCCURRENCE_CANCELLED',
    'REMINDER_CREATED', 'REMINDER_CANCELLED',
    'TIME_ENTRY_CREATED', 'TIME_ENTRY_UPDATED', 'TIME_ENTRY_DELETED',
    'LEAD_CREATED'
);

CREATE TYPE "BusinessActivityAggregateType" AS ENUM ('LEAD', 'TASK', 'TASK_OCCURRENCE');

CREATE TABLE "BusinessActivityEvent" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "aggregateType" "BusinessActivityAggregateType" NOT NULL,
    "aggregateId" INTEGER NOT NULL,
    "eventType" "BusinessActivityEventType" NOT NULL,
    "actorUserId" INTEGER,
    "metadata" JSONB,
    "state" "BusinessActivityEventState" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "processingWorkerId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessActivityEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BusinessActivityEvent_attempts_nonnegative" CHECK ("attempts" >= 0),
    CONSTRAINT "BusinessActivityEvent_businessId_dedupeKey_key" UNIQUE ("businessId", "dedupeKey")
);

CREATE INDEX "BusinessActivityEvent_state_dueAt_idx" ON "BusinessActivityEvent"("state", "dueAt");
CREATE INDEX "BusinessActivityEvent_lockedUntil_idx" ON "BusinessActivityEvent"("lockedUntil");
CREATE INDEX "BusinessActivityEvent_businessId_aggregateType_aggregateId_createdAt_idx"
  ON "BusinessActivityEvent"("businessId", "aggregateType", "aggregateId", "createdAt");

ALTER TABLE "BusinessActivityEvent" ADD CONSTRAINT "BusinessActivityEvent_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessActivityEvent" ADD CONSTRAINT "BusinessActivityEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
