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

describe("SMS settings routes", () => {
  it("reads SMS settings", async () => {
    const repository = { GetSmsSettings: vi.fn().mockResolvedValue({ enabled: true, senderId: "MOSHEMTG" }) };
    const res = response();
    await createGetSmsSettingsHandler({ businessChannelRepository: repository } as any, new NullLogger())(
      request(7), res, vi.fn()
    );
    expect(res.body).toEqual({ enabled: true, senderId: "MOSHEMTG" });
  });

  it("updates, enables, and disables SMS without accepting invalid sender IDs", async () => {
    const repository = {
      UpdateSmsSettings: vi.fn()
        .mockResolvedValueOnce({ enabled: true, senderId: "LEVFIN" })
        .mockResolvedValueOnce({ enabled: false, senderId: "LEVFIN" })
    };
    const handler = createUpdateSmsSettingsHandler({ businessChannelRepository: repository } as any, new NullLogger());

    const enabled = response();
    await handler(request(7, { enabled: true, senderId: "LEVFIN" }), enabled, vi.fn());
    expect(enabled.body).toEqual({ enabled: true, senderId: "LEVFIN" });

    const disabled = response();
    await handler(request(7, { enabled: false, senderId: "LEVFIN" }), disabled, vi.fn());
    expect(disabled.body.enabled).toBe(false);

    for (const senderId of ["12", "TOO-LONG-SENDER", "123456"]) {
      const invalid = response();
      await handler(request(7, { enabled: true, senderId }), invalid, vi.fn());
      expect(invalid.statusCode).toBe(400);
    }
  });

  it("rejects cross-business access before repository use", async () => {
    const repository = { GetSmsSettings: vi.fn(), UpdateSmsSettings: vi.fn() };
    const read = response();
    await createGetSmsSettingsHandler({ businessChannelRepository: repository } as any, new NullLogger())(
      request(8, undefined, [7]), read, vi.fn()
    );
    expect(read.statusCode).toBe(403);
    expect(repository.GetSmsSettings).not.toHaveBeenCalled();

    const update = response();
    await createUpdateSmsSettingsHandler({ businessChannelRepository: repository } as any, new NullLogger())(
      request(8, { enabled: true, senderId: "MOSHEMTG" }, [7]), update, vi.fn()
    );
    expect(update.statusCode).toBe(403);
    expect(repository.UpdateSmsSettings).not.toHaveBeenCalled();
  });
});
