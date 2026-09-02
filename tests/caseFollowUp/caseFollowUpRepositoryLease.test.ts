import { describe, expect, it, vi } from "vitest";
import { CaseFollowUpRepository } from "../../src/dataClients/SqlClient/Repositories/CaseFollowUpRepo/CaseFollowUpRepository";

describe("CaseFollowUpRepository leases", () => {
  it("loses a concurrent claim without loading or executing the work item", async () => {
    const prisma = {
      caseFollowUp: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn()
      }
    };
    const repository = new CaseFollowUpRepository(prisma as any);
    const expiresAt = new Date("2026-09-02T10:05:00Z");

    await expect(repository.claimPending(7, "lease-b", expiresAt)).resolves.toBeNull();
    expect(prisma.caseFollowUp.updateMany).toHaveBeenCalledWith({
      where: { id: 7, status: "PENDING" },
      data: {
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        processingLeaseId: "lease-b",
        leaseExpiresAt: expiresAt,
        dispatchStartedAt: null
      }
    });
    expect(prisma.caseFollowUp.findUnique).not.toHaveBeenCalled();
  });

  it("recovers only expired pre-dispatch work", async () => {
    const prisma = {
      caseFollowUp: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 9, businessId: 7, attemptCount: 1 }])
      },
      voiceInteraction: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi.fn(async (callback: any) => callback(prisma))
    };
    const repository = new CaseFollowUpRepository(prisma as any);
    const now = new Date("2026-09-02T10:10:00Z");

    await expect(repository.recoverAbandoned(now, 20)).resolves.toEqual([{ id: 9, businessId: 7, attemptCount: 1 }]);
    expect(prisma.caseFollowUp.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ dispatchStartedAt: null, leaseExpiresAt: { lt: now } })
    }));
  });

  it("quarantines an expired post-dispatch lease instead of retrying it", async () => {
    const prisma = {
      caseFollowUp: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn()
          .mockResolvedValueOnce([{ id: 9, businessId: 7 }])
          .mockResolvedValueOnce([])
      },
      voiceInteraction: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi.fn(async (callback: any) => callback(prisma))
    };
    const repository = new CaseFollowUpRepository(prisma as any);

    await repository.recoverAbandoned(new Date("2026-09-02T10:10:00Z"), 20);
    expect(prisma.caseFollowUp.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ dispatchStartedAt: { not: null } }),
      data: expect.objectContaining({
        status: "FAILED",
        failureCode: "PROVIDER_RESULT_UNKNOWN"
      })
    }));
  });

  it("requires the current lease before opening the external-dispatch boundary", async () => {
    const prisma = { caseFollowUp: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    const repository = new CaseFollowUpRepository(prisma as any);

    await expect(repository.markDispatchStarted(7, "stale-lease", new Date())).resolves.toBe(false);
    expect(prisma.caseFollowUp.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 7,
        status: "PROCESSING",
        processingLeaseId: "stale-lease",
        dispatchStartedAt: null,
        leaseExpiresAt: { gt: expect.any(Date) }
      })
    }));
  });
});
