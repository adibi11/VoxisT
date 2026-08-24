import { describe, expect, it, vi } from "vitest";
import { CasePortalAccessRepository } from "../../src/dataClients/SqlClient/Repositories/CasePortalAccessRepo/CasePortalAccessRepository";

const now = new Date("2026-08-23T12:00:00.000Z");

describe("CasePortalAccessRepository", () => {
  it("creates access only after a tenant-scoped Case lookup and revokes prior links transactionally", async () => {
    const tx = {
      case: { findFirst: vi.fn().mockResolvedValue({ id: 20 }) },
      casePortalAccess: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 4, expiresAt: new Date(now.getTime() + 60_000) })
      }
    };
    const repository = new CasePortalAccessRepository({
      $transaction: async (operation: any) => operation(tx)
    } as any);

    const result = await repository.createAccess(7, 20, "hashed-token", "encrypted-token", new Date(now.getTime() + 60_000), now);

    expect(result.outcome).toBe("created");
    expect(tx.case.findFirst).toHaveBeenCalledWith({ where: { id: 20, businessId: 7 }, select: { id: true } });
    expect(tx.casePortalAccess.updateMany).toHaveBeenCalledWith({
      where: { caseId: 20, revokedAt: null },
      data: { revokedAt: now }
    });
    expect(tx.casePortalAccess.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ caseId: 20, tokenHash: "hashed-token", tokenEncrypted: "encrypted-token" })
    }));
  });

  it("cannot revoke portal access through a different tenant", async () => {
    const tx = {
      case: { findFirst: vi.fn().mockResolvedValue(null) },
      casePortalAccess: { updateMany: vi.fn() }
    };
    const repository = new CasePortalAccessRepository({
      $transaction: async (operation: any) => operation(tx)
    } as any);

    expect(await repository.revokeAccess(8, 20, now)).toEqual({ outcome: "case_not_found" });
    expect(tx.case.findFirst).toHaveBeenCalledWith({ where: { id: 20, businessId: 8 }, select: { id: true } });
    expect(tx.casePortalAccess.updateMany).not.toHaveBeenCalled();
  });

  it("requires matching hash, non-revocation, and future expiry when resolving", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = new CasePortalAccessRepository({
      casePortalAccess: { findFirst, updateMany: vi.fn() }
    } as any);

    expect(await repository.resolveActiveAccess("hashed-token", now)).toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenHash: "hashed-token", revokedAt: null, expiresAt: { gt: now } }
    }));
  });
});
