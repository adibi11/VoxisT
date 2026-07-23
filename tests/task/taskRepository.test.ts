import { describe, expect, it } from "vitest";
import { TaskRepository } from "../../src/dataClients/SqlClient/Repositories/TaskRepo/TaskRepository";

describe("TaskRepository", () => {
  it("scopes optimistic updates to the business and expected version", async () => {
    let updateWhere: unknown;
    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
      task: {
        updateMany: async ({ where }: any) => {
          updateWhere = where;
          return { count: 0 };
        },
        findFirst: async () => ({ id: 11, businessId: 7, version: 4 })
      }
    };

    const result = await new TaskRepository(prisma as any).updateTask(7, 11, 3, {
      expectedVersion: 3,
      headline: "Changed"
    });

    expect(updateWhere).toMatchObject({ id: 11, businessId: 7, version: 3, deletedAt: null });
    expect(result).toEqual({ outcome: "conflict", currentVersion: 4 });
  });

  it("maps the active main assignee, listeners, and viewer permissions", async () => {
    const now = new Date("2026-07-22T09:00:00.000Z");
    const prisma = {
      task: {
        findFirst: async () => ({
          id: 11, businessId: 7, headline: "Review leads", description: "Review today", status: "OPEN", priority: "HIGH", category: null,
          lead: null, startsAt: now, dueAt: null, isAllDay: false, timezone: "Asia/Jerusalem", version: 2,
          createdAt: now, updatedAt: now, completedAt: null, cancelledAt: null, deletedAt: null, schedules: [],
          participants: [
            { userId: 3, role: "MAIN_ASSIGNEE", addedAt: now, user: { id: 3, displayName: "Dana", email: "dana@example.com" } },
            { userId: 4, role: "LISTENER", addedAt: now, user: { id: 4, displayName: "Lee", email: "lee@example.com" } }
          ]
        })
      }
    };

    const task = await new TaskRepository(prisma as any).getTaskById(7, 11, 3);

    expect(task?.mainAssignee.user.id).toBe(3);
    expect(task?.listeners).toHaveLength(1);
    expect(task?.permissions.canComplete).toBe(true);
    expect(task?.permissions.canManageReminders).toBe(true);
  });

  it("creates generic, deduplicated notification work for a new task", async () => {
    const now = new Date("2026-07-23T10:00:00.000Z");
    const eventCreates: any[] = [];
    const task = {
      id: 11, businessId: 7, headline: "Review leads", description: "Review today", status: "OPEN", priority: "NORMAL", category: null,
      lead: null, startsAt: null, dueAt: null, isAllDay: false, timezone: "UTC", version: 1,
      createdAt: now, updatedAt: now, completedAt: null, cancelledAt: null, deletedAt: null, schedules: [],
      participants: [{ userId: 3, role: "MAIN_ASSIGNEE", addedAt: now, user: { id: 3, displayName: "Dana", email: "dana@example.com" } }]
    };
    const prisma = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
      task: { create: async () => task, findFirst: async () => task },
      taskParticipant: { create: async () => ({}), findFirst: async () => null, findMany: async () => [] },
      businessActivityEvent: { create: async (input: any) => { eventCreates.push(input); return input.data; } }
    };

    await new TaskRepository(prisma as any).createTask(7, 3, {
      headline: "Review leads", description: "Review today", timezone: "UTC", mainAssigneeUserId: 3
    });

    expect(eventCreates).toEqual([{ data: expect.objectContaining({
      businessId: 7, aggregateType: "TASK", aggregateId: 11, eventType: "TASK_CREATED", actorUserId: 3, dedupeKey: "task:11:created"
    }) }]);
    expect(eventCreates[0].data).not.toHaveProperty("state");
  });
});
