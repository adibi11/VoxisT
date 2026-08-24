import { describe, expect, it, vi } from "vitest";
import { BusinessChannelRepository } from "../../src/dataClients/SqlClient/Repositories/BusinessChannelRepo/BusinessChannelRepository";

function channel(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, businessId: 7, channel: "sms", provider: "twilio",
    displayName: null, status: "active", onboardingType: "manual",
    credentialsEncrypted: "keep-encrypted", config: { keep: true },
    externalAccountId: null, externalPhoneNumberId: "MOSHEMTG",
    webhookUrl: null, isDefault: false,
    createdAt: new Date("2026-08-23T12:00:00Z"),
    updatedAt: new Date("2026-08-23T12:00:00Z"),
    ...overrides
  };
}

describe("BusinessChannel SMS settings", () => {
  it("reads absent, enabled, and disabled settings", async () => {
    const findUnique = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(channel())
      .mockResolvedValueOnce(channel({ status: "disabled" }));
    const repository = new BusinessChannelRepository({ businessChannel: { findUnique } } as any);
    expect(await repository.GetSmsSettings(7)).toEqual({ enabled: false, senderId: null });
    expect(await repository.GetSmsSettings(7)).toEqual({ enabled: true, senderId: "MOSHEMTG" });
    expect(await repository.GetSmsSettings(7)).toEqual({ enabled: false, senderId: "MOSHEMTG" });
  });

  it("updates only SMS status/sender identity and preserves unrelated channel data", async () => {
    const upsert = vi.fn().mockResolvedValue(channel({ status: "disabled" }));
    const repository = new BusinessChannelRepository({ businessChannel: { upsert } } as any);
    expect(await repository.UpdateSmsSettings(7, { enabled: false, senderId: "MOSHEMTG" }))
      .toEqual({ enabled: false, senderId: "MOSHEMTG" });
    const request = upsert.mock.calls[0][0];
    expect(request.where.businessId_channel_provider).toEqual({ businessId: 7, channel: "sms", provider: "twilio" });
    expect(request.update).toEqual({ status: "disabled", externalPhoneNumberId: "MOSHEMTG" });
    expect(request.update).not.toHaveProperty("credentialsEncrypted");
    expect(request.update).not.toHaveProperty("config");
  });
});
