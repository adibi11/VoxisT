import { BusinessActivityEventType, Prisma, PrismaClient, TaskStatus } from "../../../../generated/prisma/client";
import {
  TaskScheduleDto,
  DeactivateTaskScheduleRequestDto,
  ActivateTaskScheduleRequestDto,
  CreateTaskCommentRequestDto,
  CreateTaskRequestDto,
  TaskCommentResponseDto,
  TaskPermissionsDto,
  TaskResponseDto,
  UpdateTaskRequestDto
} from "../../../../contracts";
import { ITaskRepository, TaskMutationResult } from "./ITaskRepository";

type DbClient = PrismaClient | Prisma.TransactionClient;

const taskInclude = {
  lead: { select: { id: true, name: true, status: true } },
  participants: {
    where: { removedAt: null },
    include: { user: { select: { id: true, displayName: true, email: true } } },
    orderBy: { addedAt: "asc" }
  },
  schedules: { where: { isActive: true }, orderBy: { createdAt: "desc" }, take: 1 }
} satisfies Prisma.TaskInclude;

export class TaskRepository implements ITaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createTask(businessId: number, actorUserId: number, request: CreateTaskRequestDto): Promise<TaskResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          businessId,
          leadId: request.leadId ?? null,
          headline: requiredText(request.headline, "headline"),
          description: requiredText(request.description, "description"),
          priority: request.priority ?? "NORMAL",
          category: nullableText(request.category),
          startsAt: optionalDate(request.startsAt),
          dueAt: optionalDate(request.dueAt),
          isAllDay: request.isAllDay ?? false,
          timezone: requiredText(request.timezone, "timezone"),
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId
        }
      });

      await tx.taskParticipant.create({
        data: { businessId, taskId: task.id, userId: request.mainAssigneeUserId, role: "MAIN_ASSIGNEE", addedByUserId: actorUserId }
      });
      await replaceListeners(tx, businessId, task.id, actorUserId, request.listenerUserIds ?? [], request.mainAssigneeUserId);
      if (request.schedule) await upsertActiveSchedule(tx, businessId, task.id, actorUserId, request.schedule);
      await tx.businessActivityEvent.create({ data: activityEventData(businessId, task.id, actorUserId, "TASK_CREATED", `task:${task.id}:created`) });

      return requiredTask(tx, businessId, task.id, actorUserId);
    });
  }

  async getTaskById(businessId: number, taskId: number, viewerUserId: number): Promise<TaskResponseDto | null> {
    return readTask(this.prisma, businessId, taskId, viewerUserId);
  }

  async getTasksByBusiness(businessId: number, viewerUserId: number): Promise<TaskResponseDto[]> {
    const tasks = await this.prisma.task.findMany({
      where: { businessId, deletedAt: null }, include: taskInclude, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }]
    });
    return tasks.map((task) => mapTask(task, viewerUserId));
  }

  async updateTask(businessId: number, taskId: number, actorUserId: number, request: UpdateTaskRequestDto): Promise<TaskMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.task.updateMany({
        where: { id: taskId, businessId, version: request.expectedVersion, deletedAt: null },
        data: {
          headline: request.headline === undefined ? undefined : requiredText(request.headline, "headline"),
          description: request.description === undefined ? undefined : requiredText(request.description, "description"),
          priority: request.priority,
          category: request.category === undefined ? undefined : nullableText(request.category),
          leadId: request.leadId,
          startsAt: request.startsAt === undefined ? undefined : optionalDate(request.startsAt),
          dueAt: request.dueAt === undefined ? undefined : optionalDate(request.dueAt),
          isAllDay: request.isAllDay,
          timezone: request.timezone === undefined ? undefined : requiredText(request.timezone, "timezone"),
          updatedByUserId: actorUserId,
          version: { increment: 1 }
        }
      });
      if (update.count === 0) return mutationFailure(tx, businessId, taskId);
      if (request.mainAssigneeUserId !== undefined) await replaceMainAssignee(tx, businessId, taskId, actorUserId, request.mainAssigneeUserId, request.expectedVersion + 1);
      if (request.listenerUserIds !== undefined) await replaceListeners(tx, businessId, taskId, actorUserId, request.listenerUserIds, request.mainAssigneeUserId);
      if (request.schedule !== undefined) {
        if (request.schedule === null) await tx.taskSchedule.updateMany({ where: { businessId, taskId, isActive: true }, data: { isActive: false, deactivatedAt: new Date(), deactivatedByUserId: actorUserId } });
        else await upsertActiveSchedule(tx, businessId, taskId, actorUserId, request.schedule);
      }
      await tx.businessActivityEvent.create({ data: activityEventData(businessId, taskId, actorUserId, "TASK_UPDATED", `task:${taskId}:updated:${request.expectedVersion + 1}`) });
      return { outcome: "updated", task: await requiredTask(tx, businessId, taskId, actorUserId) };
    });
  }

  async completeTask(businessId: number, taskId: number, actorUserId: number, expectedVersion: number): Promise<TaskMutationResult> {
    return this.transitionTask(businessId, taskId, actorUserId, expectedVersion, "COMPLETED");
  }

  async cancelTask(businessId: number, taskId: number, actorUserId: number, expectedVersion: number, cancellationReason?: string): Promise<TaskMutationResult> {
    return this.transitionTask(businessId, taskId, actorUserId, expectedVersion, "CANCELLED", cancellationReason);
  }

  async deleteTask(businessId: number, taskId: number, actorUserId: number, expectedVersion: number): Promise<TaskMutationResult> {
    return this.transitionTask(businessId, taskId, actorUserId, expectedVersion, "DELETED");
  }

  async activateTaskSchedule(businessId: number, taskId: number, actorUserId: number, request: ActivateTaskScheduleRequestDto): Promise<TaskMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.updateMany({
        where: { id: taskId, businessId, version: request.expectedVersion, deletedAt: null },
        data: { updatedByUserId: actorUserId, version: { increment: 1 } }
      });
      if (updated.count === 0) return mutationFailure(tx, businessId, taskId);
      const data = {
        rrule: requiredText(request.rrule, "rrule"), timezone: requiredText(request.timezone, "timezone"),
        startsAt: optionalDate(request.startsAt), endsAt: optionalDate(request.endsAt),
        nextOccurrenceAt: requiredDate(request.nextOccurrenceAt), nextNotificationAt: notificationAt(requiredDate(request.nextOccurrenceAt), request.occurrenceDueOffsetMinutes ?? null), occurrenceDueOffsetMinutes: request.occurrenceDueOffsetMinutes ?? null,
        isActive: true, updatedByUserId: actorUserId, deactivatedAt: null, deactivatedByUserId: null
      };
      const schedule = await tx.taskSchedule.findFirst({ where: { businessId, taskId, isActive: true } });
      if (schedule) await tx.taskSchedule.update({ where: { id: schedule.id }, data });
      else await tx.taskSchedule.create({ data: { businessId, taskId, ...data, createdByUserId: actorUserId } });
      await tx.businessActivityEvent.create({ data: activityEventData(businessId, taskId, actorUserId, schedule ? "SCHEDULE_UPDATED" : "SCHEDULE_CREATED", `task:${taskId}:schedule:${request.expectedVersion + 1}`) });
      return { outcome: "updated", task: await requiredTask(tx, businessId, taskId, actorUserId) };
    });
  }

  async deactivateTaskSchedule(businessId: number, taskId: number, actorUserId: number, request: DeactivateTaskScheduleRequestDto): Promise<TaskMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.updateMany({
        where: { id: taskId, businessId, version: request.expectedVersion, deletedAt: null },
        data: { updatedByUserId: actorUserId, version: { increment: 1 } }
      });
      if (updated.count === 0) return mutationFailure(tx, businessId, taskId);
      await tx.taskSchedule.updateMany({ where: { businessId, taskId, isActive: true }, data: { isActive: false, deactivatedAt: new Date(), deactivatedByUserId: actorUserId, updatedByUserId: actorUserId } });
      await tx.businessActivityEvent.create({ data: activityEventData(businessId, taskId, actorUserId, "SCHEDULE_DEACTIVATED", `task:${taskId}:schedule-deactivated:${request.expectedVersion + 1}`) });
      return { outcome: "updated", task: await requiredTask(tx, businessId, taskId, actorUserId) };
    });
  }

  async createComment(businessId: number, taskId: number, actorUserId: number, request: CreateTaskCommentRequestDto): Promise<TaskCommentResponseDto> {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, businessId, deletedAt: null }, select: { id: true } });
    if (!task) throw new Error(`Task ${taskId} not found for business ${businessId}`);
    const comment = await this.prisma.taskComment.create({
      data: { businessId, taskId, authorUserId: actorUserId, body: requiredText(request.body, "body") },
      include: { author: { select: { id: true, displayName: true, email: true } } }
    });
    await this.prisma.businessActivityEvent.create({ data: activityEventData(businessId, taskId, actorUserId, "COMMENT_CREATED", `task-comment:${comment.id}:created`, { commentId: comment.id }) });
    return mapComment(comment);
  }

  async getComments(businessId: number, taskId: number): Promise<TaskCommentResponseDto[] | null> {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, businessId, deletedAt: null }, select: { id: true } });
    if (!task) return null;
    const comments = await this.prisma.taskComment.findMany({
      where: { businessId, taskId },
      include: { author: { select: { id: true, displayName: true, email: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    return comments.map(mapComment);
  }

  async updateComment(businessId: number, taskId: number, commentId: number, actorUserId: number, request: CreateTaskCommentRequestDto): Promise<TaskCommentResponseDto | null> {
    const updated = await this.prisma.taskComment.updateMany({
      where: { id: commentId, taskId, businessId, authorUserId: actorUserId, deletedAt: null },
      data: { body: requiredText(request.body, "body"), editedAt: new Date() }
    });
    if (updated.count === 0) return null;
    const comment = await this.prisma.taskComment.findUnique({ where: { id: commentId }, include: { author: { select: { id: true, displayName: true, email: true } } } });
    if (!comment) return null;
    await this.prisma.businessActivityEvent.create({ data: activityEventData(businessId, taskId, actorUserId, "COMMENT_EDITED", `task-comment:${commentId}:edited:${comment.updatedAt.getTime()}`, { commentId }) });
    return mapComment(comment);
  }

  async deleteComment(businessId: number, taskId: number, commentId: number, actorUserId: number): Promise<boolean> {
    const deleted = await this.prisma.taskComment.updateMany({
      where: { id: commentId, taskId, businessId, authorUserId: actorUserId, deletedAt: null },
      data: { deletedAt: new Date(), deletedByUserId: actorUserId }
    });
    return true;
  }

  async getActiveTaskSchedule(businessId: number, taskId: number): Promise<TaskScheduleDto | null> {
    const schedule = await this.prisma.taskSchedule.findFirst({
      where: { businessId, taskId, isActive: true, task: { deletedAt: null } },
      orderBy: { createdAt: "desc" }
    });
    return schedule ? mapSchedule(schedule) : null;
  }


  

  private async transitionTask(businessId: number, taskId: number, actorUserId: number, expectedVersion: number, status: Extract<TaskStatus, "COMPLETED" | "CANCELLED" | "DELETED">, cancellationReason?: string): Promise<TaskMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const result = await tx.task.updateMany({
        where: { id: taskId, businessId, version: expectedVersion, deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } },
        data: {
          status,
          updatedByUserId: actorUserId,
          version: { increment: 1 },
          completedAt: status === "COMPLETED" ? now : undefined,
          completedByUserId: status === "COMPLETED" ? actorUserId : undefined,
          cancelledAt: status === "CANCELLED" ? now : undefined,
          cancelledByUserId: status === "CANCELLED" ? actorUserId : undefined,
          cancellationReason: status === "CANCELLED" ? nullableText(cancellationReason) : undefined,
          deletedAt: status === "DELETED" ? now : undefined,
          deletedByUserId: status === "DELETED" ? actorUserId : undefined
        }
      });
      if (result.count === 0) return mutationFailure(tx, businessId, taskId);
      await tx.businessActivityEvent.create({ data: activityEventData(businessId, taskId, actorUserId, status === "COMPLETED" ? "TASK_COMPLETED" : status === "CANCELLED" ? "TASK_CANCELLED" : "TASK_DELETED", `task:${taskId}:${status.toLowerCase()}:${expectedVersion + 1}`) });
      return { outcome: "updated", task: await requiredTask(tx, businessId, taskId, actorUserId) };
    });
  }
}

function activityEventData(
  businessId: number,
  aggregateId: number,
  actorUserId: number | null,
  eventType: BusinessActivityEventType,
  dedupeKey: string,
  metadata?: Record<string, number>
) {
  return {
    businessId,
    aggregateType: "TASK" as const,
    aggregateId,
    actorUserId,
    eventType,
    dedupeKey,
    metadata: metadata as Prisma.InputJsonValue | undefined
  };
}

async function replaceMainAssignee(tx: Prisma.TransactionClient, businessId: number, taskId: number, actorUserId: number, userId: number, mutationVersion: number): Promise<void> {
  const current = await tx.taskParticipant.findFirst({ where: { businessId, taskId, role: "MAIN_ASSIGNEE", removedAt: null } });
  if (current?.userId === userId) return;
  if (current) await tx.taskParticipant.update({ where: { id: current.id }, data: { removedAt: new Date(), removedByUserId: actorUserId } });
  const existing = await tx.taskParticipant.findFirst({ where: { businessId, taskId, userId }, orderBy: { id: "desc" } });
  if (existing) await tx.taskParticipant.update({ where: { id: existing.id }, data: { role: "MAIN_ASSIGNEE", removedAt: null, removedByUserId: null, addedAt: new Date(), addedByUserId: actorUserId } });
  else await tx.taskParticipant.create({ data: { businessId, taskId, userId, role: "MAIN_ASSIGNEE", addedByUserId: actorUserId } });
  await tx.businessActivityEvent.create({ data: activityEventData(businessId, taskId, actorUserId, "ASSIGNEE_CHANGED", `task:${taskId}:assignee-changed:${mutationVersion}`) });
}

async function replaceListeners(tx: Prisma.TransactionClient, businessId: number, taskId: number, actorUserId: number, listenerIds: number[], mainAssigneeUserId?: number): Promise<void> {
  const activeMain = await tx.taskParticipant.findFirst({ where: { businessId, taskId, role: "MAIN_ASSIGNEE", removedAt: null } });
  const ids = [...new Set(listenerIds)].filter((id) => id !== (mainAssigneeUserId ?? activeMain?.userId));
  const active = await tx.taskParticipant.findMany({ where: { businessId, taskId, role: "LISTENER", removedAt: null } });
  for (const participant of active.filter((participant) => !ids.includes(participant.userId))) {
    await tx.taskParticipant.update({ where: { id: participant.id }, data: { removedAt: new Date(), removedByUserId: actorUserId } });
  }
  for (const userId of ids.filter((id) => !active.some((participant) => participant.userId === id))) {
    const existing = await tx.taskParticipant.findFirst({ where: { businessId, taskId, userId }, orderBy: { id: "desc" } });
    if (existing) await tx.taskParticipant.update({ where: { id: existing.id }, data: { role: "LISTENER", removedAt: null, removedByUserId: null, addedAt: new Date(), addedByUserId: actorUserId } });
    else await tx.taskParticipant.create({ data: { businessId, taskId, userId, role: "LISTENER", addedByUserId: actorUserId } });
  }
}

async function upsertActiveSchedule(tx: Prisma.TransactionClient, businessId: number, taskId: number, actorUserId: number, schedule: NonNullable<CreateTaskRequestDto["schedule"]>): Promise<void> {
  const startsAt = optionalDate(schedule.startsAt);
  const offset = schedule.occurrenceDueOffsetMinutes ?? null;
  const data = { rrule: requiredText(schedule.rrule, "rrule"), timezone: requiredText(schedule.timezone, "timezone"), startsAt, endsAt: optionalDate(schedule.endsAt), nextOccurrenceAt: startsAt, nextNotificationAt: notificationAt(startsAt, offset), occurrenceDueOffsetMinutes: offset, updatedByUserId: actorUserId };
  const existing = await tx.taskSchedule.findFirst({ where: { businessId, taskId, isActive: true } });
  if (existing) await tx.taskSchedule.update({ where: { id: existing.id }, data });
  else await tx.taskSchedule.create({ data: { businessId, taskId, ...data, createdByUserId: actorUserId } });
}



async function readTask(client: DbClient, businessId: number, taskId: number, viewerUserId: number): Promise<TaskResponseDto | null> {
  const task = await client.task.findFirst({ where: { id: taskId, businessId }, include: taskInclude });
  return task ? mapTask(task, viewerUserId) : null;
}

async function requiredTask(client: DbClient, businessId: number, taskId: number, viewerUserId: number): Promise<TaskResponseDto> {
  const task = await readTask(client, businessId, taskId, viewerUserId);
  if (!task) throw new Error(`Task ${taskId} not found for business ${businessId}`);
  return task;
}

async function mutationFailure(client: DbClient, businessId: number, taskId: number): Promise<TaskMutationResult> {
  const task = await client.task.findFirst({ where: { id: taskId, businessId } });
  return task ? { outcome: "conflict", currentVersion: task.version } : { outcome: "not_found" };
}

function mapTask(task: any, viewerUserId: number): TaskResponseDto {
  const main = task.participants.find((participant: any) => participant.role === "MAIN_ASSIGNEE");
  if (!main) throw new Error(`Task ${task.id} has no active main assignee`);
  const viewer = task.participants.find((participant: any) => participant.userId === viewerUserId);
  return {
    id: task.id, businessId: task.businessId, headline: task.headline, description: task.description, status: task.status,
    priority: task.priority, category: task.category, lead: task.lead ? { id: task.lead.id, name: task.lead.name, status: task.lead.status } : null,
    startsAt: iso(task.startsAt), dueAt: iso(task.dueAt), isAllDay: task.isAllDay, timezone: task.timezone,
    mainAssignee: mapParticipant(main), listeners: task.participants.filter((participant: any) => participant.role === "LISTENER").map(mapParticipant),
    schedule: task.schedules[0] ? mapSchedule(task.schedules[0]) : null, version: task.version,
    createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString(), completedAt: iso(task.completedAt), cancelledAt: iso(task.cancelledAt), deletedAt: iso(task.deletedAt),
    permissions: taskPermissions(task, viewer)
  };
}

function mapParticipant(participant: any) { 
  return { user: participant.user, role: participant.role, addedAt: participant.addedAt.toISOString() }; 
}
function mapSchedule(schedule: any) { 
  return { id: schedule.id, rrule: schedule.rrule, 
    timezone: schedule.timezone, 
    isActive: schedule.isActive, 
    startsAt: iso(schedule.startsAt), 
    endsAt: iso(schedule.endsAt), 
    nextOccurrenceAt: iso(schedule.nextOccurrenceAt), 
    occurrenceDueOffsetMinutes: schedule.occurrenceDueOffsetMinutes }; }
function mapComment(comment: any): TaskCommentResponseDto { 
  return { 
    id: comment.id, 
    taskId: comment.taskId, 
    body: comment.body, 
    author: comment.author, 
    createdAt: comment.createdAt.toISOString(), 
    updatedAt: comment.updatedAt.toISOString(), 
    editedAt: iso(comment.editedAt), 
    deletedAt: iso(comment.deletedAt), 
    isDeleted: comment.deletedAt !== null }; }
function taskPermissions(task: any, participant: any | undefined): TaskPermissionsDto { const isMain = participant?.role === "MAIN_ASSIGNEE"; const canView = Boolean(participant); return { canView, canEdit: isMain && task.status !== "DELETED", canComplete: isMain && ["OPEN", "IN_PROGRESS"].includes(task.status), canCancel: isMain && ["OPEN", "IN_PROGRESS"].includes(task.status), canDelete: isMain && task.status !== "DELETED", canComment: canView && task.status !== "DELETED", canManageReminders: isMain && task.status !== "DELETED" }; }
function iso(value?: Date | null): string | null { return value?.toISOString() ?? null; }
function requiredText(value: string, field: string): string { const normalized = value?.trim(); if (!normalized) throw new Error(`${field} is required`); return normalized; }
function nullableText(value?: string | null): string | null { const normalized = value?.trim(); return normalized || null; }
function optionalDate(value?: string | null): Date | null { return value ? requiredDate(value) : null; }
function requiredDate(value: string): Date { const parsed = new Date(value); if (!Number.isFinite(parsed.getTime())) throw new Error(`Invalid date: ${value}`); return parsed; }
function notificationAt(occurrenceAt: Date | null, offsetMinutes: number | null): Date | null { return occurrenceAt ? new Date(occurrenceAt.getTime() - (offsetMinutes ?? 0) * 60_000) : null; }
