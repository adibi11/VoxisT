import { describe, expect, it, vi } from "vitest";
import {
  createGetFollowUpPolicyHandler,
  createUpdateFollowUpPolicyHandler
} from "../../src/Api/routes/followUpRoutes";
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

const policy = {
  id: 4,
  businessId: 7,
  enabled: true,
  timezone: "Asia/Jerusalem",
  delayMinutes: 90,
  allowedStartHour: 9,
  allowedEndHour: 17,
  maxFollowUps: 2,
  messageTemplate: "Still interested?",
  caseDocumentFollowUpEnabled: true,
  caseDocumentFollowUpHour: 10,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z"
};

describe("follow-up policy endpoints", () => {
  it("GET returns legacy and Case-document policy fields", async () => {
    const followUpRepository = {
      getBusinessFollowUpPolicy: vi.fn().mockResolvedValue(policy)
    };
    const res = response();
    await createGetFollowUpPolicyHandler({ followUpRepository } as any, new NullLogger())(
      request(7), res, vi.fn()
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(policy);
  });

  it("PUT saves fixed-hour Case settings without requiring legacy fields", async () => {
    const followUpRepository = {
      getBusinessFollowUpPolicy: vi.fn().mockResolvedValue({ ...policy, caseDocumentFollowUpEnabled: false }),
      upsertBusinessFollowUpPolicy: vi.fn().mockResolvedValue(policy)
    };
    const body = {
      timezone: "Asia/Jerusalem",
      caseDocumentFollowUpEnabled: true,
      caseDocumentFollowUpHour: 10
    };
    const res = response();
    await createUpdateFollowUpPolicyHandler({ followUpRepository } as any, new NullLogger())(
      request(7, body), res, vi.fn()
    );
    expect(res.statusCode).toBe(200);
    expect(followUpRepository.upsertBusinessFollowUpPolicy).toHaveBeenCalledWith(7, body);
  });

  it("PUT rejects an invalid timezone or hour", async () => {
    const followUpRepository = {
      getBusinessFollowUpPolicy: vi.fn(),
      upsertBusinessFollowUpPolicy: vi.fn()
    };
    for (const body of [
      { timezone: "Not/A_Timezone", caseDocumentFollowUpEnabled: true, caseDocumentFollowUpHour: 10 },
      { timezone: "UTC", caseDocumentFollowUpEnabled: true, caseDocumentFollowUpHour: 24 }
    ]) {
      const res = response();
      await createUpdateFollowUpPolicyHandler({ followUpRepository } as any, new NullLogger())(
        request(7, body), res, vi.fn()
      );
      expect(res.statusCode).toBe(400);
    }
    expect(followUpRepository.upsertBusinessFollowUpPolicy).not.toHaveBeenCalled();
  });

  it("PUT requires an hour when enabling and prevents clearing an active hour", async () => {
    const followUpRepository = {
      getBusinessFollowUpPolicy: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(policy),
      upsertBusinessFollowUpPolicy: vi.fn()
    };
    const enableWithoutHour = response();
    await createUpdateFollowUpPolicyHandler({ followUpRepository } as any, new NullLogger())(
      request(7, { timezone: "UTC", caseDocumentFollowUpEnabled: true }),
      enableWithoutHour,
      vi.fn()
    );
    expect(enableWithoutHour.statusCode).toBe(400);

    const clearActiveHour = response();
    await createUpdateFollowUpPolicyHandler({ followUpRepository } as any, new NullLogger())(
      request(7, { caseDocumentFollowUpHour: null }),
      clearActiveHour,
      vi.fn()
    );
    expect(clearActiveHour.statusCode).toBe(400);
  });

  it("rejects cross-Business access before reading or writing policy state", async () => {
    const followUpRepository = {
      getBusinessFollowUpPolicy: vi.fn(),
      upsertBusinessFollowUpPolicy: vi.fn()
    };
    const res = response();
    await createUpdateFollowUpPolicyHandler({ followUpRepository } as any, new NullLogger())(
      request(8, { caseDocumentFollowUpEnabled: true, caseDocumentFollowUpHour: 10 }, [7]),
      res,
      vi.fn()
    );
    expect(res.statusCode).toBe(403);
    expect(followUpRepository.getBusinessFollowUpPolicy).not.toHaveBeenCalled();
    expect(followUpRepository.upsertBusinessFollowUpPolicy).not.toHaveBeenCalled();
  });
});
