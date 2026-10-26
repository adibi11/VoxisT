import { describe, expect, it, vi } from "vitest";
import {
  createGetVoiceSettingsHandler,
  createUpdateVoiceSettingsHandler
} from "../../src/Api/routes/businessRoutes";
import { NullLogger } from "../../src/logging/logger";

function response() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status: vi.fn((code: number) => { res.statusCode = code; return res; }),
    json: vi.fn((body: unknown) => { res.body = body; return res; })
  };
  return res;
}

function request(businessId: number, body?: unknown, ownedBusinessIds = [businessId], platformRole = "admin") {
  return {
    params: { businessId: String(businessId) },
    body,
    auth: {
      userId: 1,
      platformRole,
      businessIds: ownedBusinessIds,
      businessMemberships: ownedBusinessIds.map((id) => ({ businessId: id, role: "owner" }))
    }
  } as any;
}

describe("voice settings routes", () => {
  it("stores policy and provider configuration through one owner-scoped contract", async () => {
    const settings = {
      enabled: true,
      thresholdDays: 2,
      providerEnabled: true,
      providerConfigured: true,
      provider: "elevenlabs",
      outboundNumberId: "number-id",
      agentId: "agent-id"
    };
    const repository = { update: vi.fn().mockResolvedValue(settings) };
    const res = response();
    await createUpdateVoiceSettingsHandler(
      { voiceConfigurationRepository: repository } as any,
      new NullLogger()
    )(request(7, {
      enabled: true,
      thresholdDays: 2,
      providerEnabled: true,
      provider: "elevenlabs",
      outboundNumberId: "number-id",
      agentId: "agent-id"
    }), res, vi.fn());
    expect(repository.update).toHaveBeenCalledWith(7, expect.objectContaining({ thresholdDays: 2 }));
    expect(res.body).toEqual(settings);
  });

  it("rejects enabled voice without a positive threshold or complete provider config", async () => {
    const repository = { update: vi.fn() };
    for (const body of [
      { enabled: true, thresholdDays: null, providerEnabled: false, provider: "elevenlabs", outboundNumberId: null, agentId: null },
      { enabled: true, thresholdDays: 0, providerEnabled: false, provider: "elevenlabs", outboundNumberId: null, agentId: null },
      { enabled: true, thresholdDays: 1, providerEnabled: true, provider: "elevenlabs", outboundNumberId: null, agentId: "agent" }
    ]) {
      const res = response();
      await createUpdateVoiceSettingsHandler(
        { voiceConfigurationRepository: repository } as any,
        new NullLogger()
      )(request(7, body), res, vi.fn());
      expect(res.statusCode).toBe(400);
    }
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("keeps provider IDs platform-admin-only when reading voice configuration", async () => {
    const repository = { get: vi.fn() };
    const res = response();
    await createGetVoiceSettingsHandler(
      { voiceConfigurationRepository: repository } as any,
      new NullLogger()
    )(request(7, undefined, [7], "user"), res, vi.fn());
    expect(res.statusCode).toBe(403);
    expect(repository.get).not.toHaveBeenCalled();
  });

  it("keeps provider agent and phone IDs platform-admin managed", async () => {
    const repository = { update: vi.fn() };
    const res = response();
    await createUpdateVoiceSettingsHandler(
      { voiceConfigurationRepository: repository } as any,
      new NullLogger()
    )(request(7, {
      enabled: true,
      thresholdDays: 1,
      providerEnabled: true,
      provider: "elevenlabs",
      outboundNumberId: "phone-id",
      agentId: "agent-id"
    }, [7], "user"), res, vi.fn());
    expect(res.statusCode).toBe(403);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
