import { describe, expect, it } from "vitest";
import {
  CreatePortalAccessResult,
  FindActivePortalAccessResult,
  ICasePortalAccessRepository,
  ResolvedPortalAccess,
  RevokePortalAccessResult
} from "../../src/dataClients/SqlClient/Repositories/CasePortalAccessRepo/ICasePortalAccessRepository";
import { hashPortalAccessToken, PortalAccessService } from "../../src/Portal/PortalAccessService";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const TOKEN_A = "a".repeat(43);
const TOKEN_B = "b".repeat(43);
const cipher = {
  encrypt: (token: string) => Buffer.from(token).toString("base64"),
  decrypt: (value: string) => Buffer.from(value, "base64").toString()
};

class Repository implements ICasePortalAccessRepository {
  active: { id: number; tokenHash: string; tokenEncrypted: string | null; expiresAt: Date; revoked: boolean } | null = null;
  creates = 0;

  async createAccess(businessId: number, caseId: number, tokenHash: string, tokenEncrypted: string, expiresAt: Date): Promise<CreatePortalAccessResult> {
    if (businessId !== 7 || caseId !== 20) return { outcome: "case_not_found" };
    if (this.active) this.active.revoked = true;
    this.active = { id: ++this.creates, tokenHash, tokenEncrypted, expiresAt, revoked: false };
    return { outcome: "created", access: { id: this.active.id, expiresAt } };
  }
  async findActiveAccessForCase(businessId: number, caseId: number, now: Date): Promise<FindActivePortalAccessResult> {
    if (businessId !== 7 || caseId !== 20) return { outcome: "case_not_found" };
    const access = this.active && !this.active.revoked && this.active.expiresAt > now ? this.active : null;
    return { outcome: "found", access };
  }
  async resolveActiveAccess(tokenHash: string, now: Date): Promise<ResolvedPortalAccess | null> {
    if (!this.active || this.active.revoked || this.active.expiresAt <= now || this.active.tokenHash !== tokenHash) return null;
    return { id: this.active.id, tokenHash, expiresAt: this.active.expiresAt, case: {} as any };
  }
  async revokeAccess(businessId: number, caseId: number): Promise<RevokePortalAccessResult> {
    if (businessId !== 7 || caseId !== 20) return { outcome: "case_not_found" };
    if (this.active) this.active.revoked = true;
    return { outcome: "revoked", revokedCount: this.active ? 1 : 0 };
  }
}

describe("internal active portal access recovery", () => {
  it("recovers and reuses the same active token while hash authentication remains authoritative", async () => {
    const repository = new Repository();
    const service = new PortalAccessService(repository, () => NOW, () => TOKEN_A, cipher);
    await service.createAccess(7, 20);
    const first = await service.getOrCreateActiveAccess(7, 20);
    const second = await service.getOrCreateActiveAccess(7, 20);
    expect(first?.accessToken).toBe(TOKEN_A);
    expect(second?.accessToken).toBe(TOKEN_A);
    expect(repository.creates).toBe(1);
    expect(repository.active?.tokenEncrypted).not.toContain(TOKEN_A);
    expect(await service.resolveAccess(TOKEN_A)).not.toBeNull();
  });

  it("rotates expired, revoked, and legacy hash-only access", async () => {
    const repository = new Repository();
    let next = TOKEN_B;
    const service = new PortalAccessService(repository, () => NOW, () => next, cipher);

    repository.active = { id: 1, tokenHash: hashPortalAccessToken(TOKEN_A), tokenEncrypted: null, expiresAt: new Date(NOW.getTime() + 60_000), revoked: false };
    expect((await service.getOrCreateActiveAccess(7, 20))?.accessToken).toBe(TOKEN_B);

    repository.active!.expiresAt = new Date(NOW.getTime() - 1);
    next = TOKEN_A;
    expect((await service.getOrCreateActiveAccess(7, 20))?.accessToken).toBe(TOKEN_A);

    await service.revokeAccess(7, 20);
    next = TOKEN_B;
    expect((await service.getOrCreateActiveAccess(7, 20))?.accessToken).toBe(TOKEN_B);
  });

  it("keeps explicit regeneration/revocation behavior and rejects cross-business access", async () => {
    const repository = new Repository();
    let next = TOKEN_A;
    const service = new PortalAccessService(repository, () => NOW, () => next, cipher);
    await service.createAccess(7, 20);
    next = TOKEN_B;
    await service.createAccess(7, 20);
    expect(await service.resolveAccess(TOKEN_A)).toBeNull();
    expect(await service.resolveAccess(TOKEN_B)).not.toBeNull();
    expect(await service.getOrCreateActiveAccess(8, 20)).toBeNull();
    expect(await service.revokeAccess(8, 20)).toEqual({ outcome: "case_not_found" });
  });
});
