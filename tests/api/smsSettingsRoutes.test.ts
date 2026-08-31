import { describe, expect, it, vi } from "vitest";
import { createGetSmsSettingsHandler, createUpdateSmsSettingsHandler } from "../../src/Api/routes/businessRoutes";
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

function request(businessId: number, body?: unknown, ownedBusinessIds = [businessId]) {
  return {
    params: { businessId: String(businessId) },
    body,
    auth: {
      userId: 1,
      platformRole: "user",
      businessIds: ownedBusinessIds,
      businessMemberships: ownedBusinessIds.map((id) => ({ businessId: id, role: "owner" }))
    }
  } as any;
}

function provisioner() {
  return {
    provisionBusinessSender: vi.fn().mockResolvedValue({
      messagingServiceSid: "MG123",
      alphaSenderSid: "AI123"
    }),
    deleteMessagingService: vi.fn().mockResolvedValue(undefined)
  };
}

describe("SMS settings routes", () => {
  it("reads SMS settings including provider readiness", async () => {
    const repository = {
      GetSmsSettings: vi.fn().mockResolvedValue({
        enabled: true,
        senderId: "MOSHEMTG",
        messagingServiceConfigured: true
      })
    };
    const res = response();
    await createGetSmsSettingsHandler({ businessChannelRepository: repository } as any, new NullLogger())(
      request(7), res, vi.fn()
    );
    expect(res.body).toEqual({
      enabled: true,
      senderId: "MOSHEMTG",
      messagingServiceConfigured: true
    });
  });

  it("provisions a Messaging Service and Alpha Sender before enabling SMS", async () => {
    const repository = {
      GetSmsProviderConfiguration: vi.fn().mockResolvedValue({
        enabled: false,
        senderId: null,
        messagingServiceConfigured: false,
        messagingServiceSid: null,
        alphaSenderSid: null
      }),
      UpdateSmsSettings: vi.fn().mockResolvedValue({
        enabled: true,
        senderId: "LEVFIN",
        messagingServiceConfigured: true
      })
    };
    const twilio = provisioner();
    const res = response();

    await createUpdateSmsSettingsHandler(
      { businessChannelRepository: repository } as any,
      new NullLogger(),
      twilio
    )(request(7, { enabled: true, senderId: "LEVFIN" }), res, vi.fn());

    expect(twilio.provisionBusinessSender).toHaveBeenCalledWith(7, "LEVFIN");
    expect(repository.UpdateSmsSettings).toHaveBeenCalledWith(
      7,
      { enabled: true, senderId: "LEVFIN" },
      { messagingServiceSid: "MG123", alphaSenderSid: "AI123" }
    );
    expect(res.body.messagingServiceConfigured).toBe(true);
  });

  it("reuses an existing matching Messaging Service and disables without provisioning", async () => {
    const repository = {
      GetSmsProviderConfiguration: vi.fn().mockResolvedValue({
        enabled: false,
        senderId: "LEVFIN",
        messagingServiceConfigured: true,
        messagingServiceSid: "MG-existing",
        alphaSenderSid: "AI-existing"
      }),
      UpdateSmsSettings: vi.fn()
        .mockResolvedValueOnce({
          enabled: true,
          senderId: "LEVFIN",
          messagingServiceConfigured: true
        })
        .mockResolvedValueOnce({
          enabled: false,
          senderId: "LEVFIN",
          messagingServiceConfigured: true
        })
    };
    const twilio = provisioner();
    const handler = createUpdateSmsSettingsHandler(
      { businessChannelRepository: repository } as any,
      new NullLogger(),
      twilio
    );

    await handler(request(7, { enabled: true, senderId: "LEVFIN" }), response(), vi.fn());
    await handler(request(7, { enabled: false, senderId: "LEVFIN" }), response(), vi.fn());

    expect(twilio.provisionBusinessSender).not.toHaveBeenCalled();
    expect(repository.UpdateSmsSettings).toHaveBeenNthCalledWith(
      1,
      7,
      { enabled: true, senderId: "LEVFIN" }
    );
  });

  it("rejects invalid sender IDs", async () => {
    const repository = {
      GetSmsProviderConfiguration: vi.fn(),
      UpdateSmsSettings: vi.fn()
    };
    const handler = createUpdateSmsSettingsHandler(
      { businessChannelRepository: repository } as any,
      new NullLogger(),
      provisioner()
    );

    for (const senderId of ["12", "TOO-LONG-SENDER", "123456"]) {
      const invalid = response();
      await handler(request(7, { enabled: true, senderId }), invalid, vi.fn());
      expect(invalid.statusCode).toBe(400);
    }
    expect(repository.GetSmsProviderConfiguration).not.toHaveBeenCalled();
  });

  it("rejects cross-business access before repository or Twilio use", async () => {
    const repository = {
      GetSmsSettings: vi.fn(),
      GetSmsProviderConfiguration: vi.fn(),
      UpdateSmsSettings: vi.fn()
    };
    const twilio = provisioner();
    const read = response();
    await createGetSmsSettingsHandler({ businessChannelRepository: repository } as any, new NullLogger())(
      request(8, undefined, [7]), read, vi.fn()
    );
    expect(read.statusCode).toBe(403);

    const update = response();
    await createUpdateSmsSettingsHandler(
      { businessChannelRepository: repository } as any,
      new NullLogger(),
      twilio
    )(request(8, { enabled: true, senderId: "MOSHEMTG" }, [7]), update, vi.fn());

    expect(update.statusCode).toBe(403);
    expect(repository.GetSmsSettings).not.toHaveBeenCalled();
    expect(repository.GetSmsProviderConfiguration).not.toHaveBeenCalled();
    expect(twilio.provisionBusinessSender).not.toHaveBeenCalled();
  });
});
