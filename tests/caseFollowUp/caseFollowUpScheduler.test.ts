import { describe, expect, it, vi } from "vitest";
import { CaseFollowUpScheduler } from "../../src/CaseFollowUp/CaseFollowUpScheduler";
import { CaseMissingRequirementResolver } from "../../src/CaseFollowUp/CaseMissingRequirementResolver";
import { CaseFollowUpCandidate } from "../../src/dataClients/SqlClient/Repositories/CaseFollowUpRepo/ICaseFollowUpRepository";
import { NullLogger } from "../../src/logging/logger";

function candidate(overrides: Partial<CaseFollowUpCandidate> = {}): CaseFollowUpCandidate {
  return {
    caseId: 20,
    businessId: 7,
    status: "IN_PROGRESS",
    archivedAt: null,
    clientPhoneNumber: "+972501234567",
    leadPhoneNumber: null,
    smsConfigured: true,
    policy: {
      enabled: true,
      timezone: "UTC",
      hour: 9
    },
    requirements: [{
      id: 30,
      label: "Payslip — May",
      required: true,
      schemaName: "Payslip",
      documentTypeName: "Payslip",
      documents: []
    }],
    ...overrides
  };
}

function collaborators(candidates: CaseFollowUpCandidate[]) {
  const unique = new Map<string, number>();
  let nextId = 1;
  const repository = {
    recoverAbandoned: vi.fn().mockResolvedValue([]),
    listPendingIdsForEnqueue: vi.fn().mockResolvedValue([]),
    listSchedulerCandidates: vi.fn().mockImplementation(async () => candidates),
    createPending: vi.fn().mockImplementation(async (
      _businessId: number,
      caseId: number,
      cadenceKey: string
    ) => {
      const key = `${caseId}:${cadenceKey}`;
      if (unique.has(key)) return { outcome: "duplicate" as const };
      const id = nextId++;
      unique.set(key, id);
      return { outcome: "created" as const, id };
    })
  };
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const scheduler = new CaseFollowUpScheduler(
    repository as any,
    queue,
    new CaseMissingRequirementResolver(),
    new NullLogger(),
    { pageSize: 100 }
  );
  return { repository, queue, scheduler };
}

describe("CaseFollowUpScheduler", () => {
  const firstDay = new Date("2026-08-23T10:00:00.000Z");

  it("creates and enqueues one durable follow-up for an eligible Case", async () => {
    const { repository, queue, scheduler } = collaborators([candidate()]);
    await expect(scheduler.runOnce(firstDay)).resolves.toEqual({
      examined: 1,
      created: 1,
      duplicates: 0
    });
    expect(repository.createPending).toHaveBeenCalledWith(7, 20, "case-document:2026-08-23", firstDay);
    expect(queue.enqueue).toHaveBeenCalledWith(1);
  });

  it.each([
    ["completed", { status: "COMPLETED" as const }],
    ["archived", { archivedAt: new Date("2026-08-22T00:00:00.000Z") }],
    ["SMS-disabled", { smsConfigured: false }],
    ["missing-phone", { clientPhoneNumber: null, leadPhoneNumber: null }],
    ["fully-satisfied", {
      requirements: [{
        id: 30,
        label: "Payslip",
        required: true,
        schemaName: "Payslip",
        documentTypeName: "Payslip",
        documents: [{ status: "EXTRACTED" as const, createdAt: firstDay }]
      }]
    }]
  ])("ignores a %s Case", async (_name, overrides) => {
    const { repository, queue, scheduler } = collaborators([
      candidate(overrides as Partial<CaseFollowUpCandidate>)
    ]);
    const result = await scheduler.runOnce(firstDay);
    expect(result.created).toBe(0);
    expect(repository.createPending).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("treats duplicate execution in the same Business-local day as a normal no-op", async () => {
    const { queue, scheduler } = collaborators([candidate()]);
    await scheduler.runOnce(firstDay);
    const second = await scheduler.runOnce(new Date("2026-08-23T22:00:00.000Z"));
    expect(second.duplicates).toBe(1);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it("allows the same Case another follow-up in a later daily cadence window", async () => {
    const { repository, queue, scheduler } = collaborators([candidate()]);
    await scheduler.runOnce(firstDay);
    await scheduler.runOnce(new Date("2026-08-24T10:00:00.000Z"));
    expect(repository.createPending).toHaveBeenNthCalledWith(2, 7, 20, "case-document:2026-08-24", expect.any(Date));
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
  });

  it("re-enqueues a stranded due PENDING row with its deterministic durable ID", async () => {
    const { repository, queue, scheduler } = collaborators([]);
    repository.listPendingIdsForEnqueue.mockResolvedValue([44]);
    await scheduler.runOnce(firstDay);
    expect(queue.enqueue).toHaveBeenCalledWith(44);
  });

  it("enqueues recovered pre-dispatch work with a new execution key", async () => {
    const { repository, queue, scheduler } = collaborators([]);
    repository.recoverAbandoned.mockResolvedValue([{ id: 44, attemptCount: 2 }]);
    await scheduler.runOnce(firstDay);
    expect(queue.enqueue).toHaveBeenCalledWith(44, "recovery-2");
  });

  it("does not create a reminder before the configured local hour", async () => {
    const { repository, queue, scheduler } = collaborators([
      candidate({ policy: { enabled: true, timezone: "UTC", hour: 11 } })
    ]);
    const result = await scheduler.runOnce(firstDay);
    expect(result.created).toBe(0);
    expect(repository.createPending).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("uses the Business-local calendar date in the cadence key", async () => {
    const now = new Date("2026-08-23T22:30:00.000Z");
    const { repository, scheduler } = collaborators([
      candidate({ policy: { enabled: true, timezone: "Asia/Jerusalem", hour: 1 } })
    ]);
    await scheduler.runOnce(now);
    expect(repository.createPending).toHaveBeenCalledWith(
      7,
      20,
      "case-document:2026-08-24",
      now
    );
  });

  it("does not create Case reminders when the Case-document policy is disabled", async () => {
    const { repository, scheduler } = collaborators([
      candidate({ policy: { enabled: false, timezone: "UTC", hour: 9 } })
    ]);
    await scheduler.runOnce(firstDay);
    expect(repository.createPending).not.toHaveBeenCalled();
  });

});
