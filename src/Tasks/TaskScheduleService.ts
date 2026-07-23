import { RRule } from "rrule";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { ILogger, logger } from "../logging/logger";

export type TaskScheduleServiceOptions = { intervalMs?: number; dueScheduleLimit?: number };

/** Turns due TaskSchedule cursors into one occurrence and one notification-work event. */
export class TaskScheduleService {
  private readonly intervalMs: number;
  private readonly dueScheduleLimit: number;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly serviceLogger: ILogger = logger.child({ component: "TaskScheduleService" }),
    options: TaskScheduleServiceOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? 60_000;
    this.dueScheduleLimit = options.dueScheduleLimit ?? 100;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce().catch((error) => this.serviceLogger.error("task.schedule.tick.failed", { error })), this.intervalMs);
    void this.runOnce().catch((error) => this.serviceLogger.error("task.schedule.initial_tick.failed", { error }));
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(now: Date = new Date()): Promise<void> {
    const schedules = await this.prisma.taskSchedule.findMany({
      where: { isActive: true, OR: [{ nextOccurrenceAt: null }, { nextNotificationAt: null }, { nextNotificationAt: { lte: now } }], task: { deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } } },
      select: { id: true }, orderBy: { nextNotificationAt: "asc" }, take: this.dueScheduleLimit
    });
    for (const schedule of schedules) {
      try {
        await this.createDueOccurrence(schedule.id, now);
      } catch (error) {
        this.serviceLogger.error("task.schedule.process.failed", { scheduleId: schedule.id, error });
      }
    }
  }

  private async createDueOccurrence(scheduleId: number, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const schedule = await tx.taskSchedule.findFirst({
        where: { 
          id: scheduleId, isActive: true, OR: 
          [{ nextOccurrenceAt: null }, 
            { nextNotificationAt: null }, 
            { nextNotificationAt: { lte: now } }], 
            task: { deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } } },
        include: { task: { select: { id: true, businessId: true, startsAt: true, participants: { where: { role: "MAIN_ASSIGNEE", removedAt: null }, select: { userId: true } } } }
      }});
      if (!schedule) return;
      const scheduledFor = schedule.nextOccurrenceAt ?? occurrenceAtOrAfter(schedule.rrule, schedule.timezone, schedule.startsAt ?? schedule.task.startsAt ?? schedule.createdAt, now);
      if (!scheduledFor) {
        await tx.taskSchedule.update({ 
          where: { id: schedule.id }, 
          data: { isActive: false, deactivatedAt: now } 
        });
        return;
      }
      const notificationDueAt = schedule.nextNotificationAt ?? notificationAt(scheduledFor, schedule.occurrenceDueOffsetMinutes);
      if (notificationDueAt > now) {
        await tx.taskSchedule.update({ 
          where: { id: schedule.id }, 
          data: { nextOccurrenceAt: scheduledFor, nextNotificationAt: notificationDueAt } 
        });
        return;
      }
      const assignee = schedule.task.participants[0];
      if (!assignee) throw new Error(`Task ${schedule.taskId} has no active main assignee`);

      const occurrence = await tx.taskOccurrence.upsert({
        where: { scheduleId_scheduledFor: { scheduleId: schedule.id, scheduledFor } },
        create: { businessId: schedule.businessId, taskId: schedule.taskId, scheduleId: schedule.id, scheduledFor, dueAt: null, assigneeUserId: assignee.userId },
        update: {}
      });
      await tx.businessActivityEvent.upsert({
        where: { businessId_dedupeKey: { businessId: schedule.businessId, dedupeKey: `task-schedule:${schedule.id}:occurrence:${scheduledFor.toISOString()}:reminder-due` } },
        create: { businessId: schedule.businessId, aggregateType: "TASK_OCCURRENCE", aggregateId: occurrence.id, eventType: "TASK_REMINDER_DUE", dueAt: notificationDueAt, dedupeKey: `task-schedule:${schedule.id}:occurrence:${scheduledFor.toISOString()}:reminder-due` },
        update: {}
      });
      const nextOccurrenceAt = nextOccurrence(schedule.rrule, schedule.timezone, schedule.startsAt, scheduledFor);
      await tx.taskSchedule.update({ where: { id: schedule.id }, data: { nextOccurrenceAt, nextNotificationAt: nextOccurrenceAt ? notificationAt(nextOccurrenceAt, schedule.occurrenceDueOffsetMinutes) : null } });
    });
  }
}

function nextOccurrence(rrule: string, timezone: string, startsAt: Date | null, after: Date): Date | null {
  return recurrenceRule(rrule, timezone, startsAt ?? after).after(after, false);
}

function occurrenceAtOrAfter(rrule: string, timezone: string, startsAt: Date, at: Date): Date | null {
  return recurrenceRule(rrule, timezone, startsAt).after(at, true);
}

function recurrenceRule(rrule: string, timezone: string, startsAt: Date): RRule {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return new RRule({ ...RRule.parseString(rrule), dtstart: startsAt, tzid: timezone });
  } catch (error) {
    throw new Error(`Invalid task schedule RRULE or timezone: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

function notificationAt(scheduledFor: Date, offsetMinutes: number | null): Date {
  return new Date(scheduledFor.getTime() - (offsetMinutes ?? 0) * 60_000);
}
