import { describe, expect, it, vi } from "vitest";
import { CaseInboundEmailService } from "../../src/InboundEmail/CaseInboundEmailService";

describe("CaseInboundEmailService", () => {
  it("creates a non-guessable address without exposing the Case id", async () => {
    const repository = { getOrCreateCaseToken: vi.fn(async (_b, _c, factory) => factory()) };
    const address = await new CaseInboundEmailService(repository as any, "docs.voxistudio.com").getOrCreateAddress(7, 123);
    expect(address).toMatch(/^case-[a-f0-9]{16}@docs\.voxistudio\.com$/);
    expect(address).not.toContain("123");
  });
  it("returns the same persisted token on repeated creation", async () => {
    const repository = { getOrCreateCaseToken: vi.fn().mockResolvedValue("a".repeat(16)) };
    const service = new CaseInboundEmailService(repository as any, "docs.voxistudio.com");
    await expect(service.getOrCreateAddress(7, 12)).resolves.toBe(`case-${"a".repeat(16)}@docs.voxistudio.com`);
    await expect(service.getOrCreateAddress(7, 12)).resolves.toBe(`case-${"a".repeat(16)}@docs.voxistudio.com`);
  });
  it("does not create an address for another tenant's Case", async () => {
    const repository = { getOrCreateCaseToken: vi.fn().mockResolvedValue(null) };
    await expect(new CaseInboundEmailService(repository as any, "docs.voxistudio.com").getOrCreateAddress(8, 12)).resolves.toBeNull();
  });
});

