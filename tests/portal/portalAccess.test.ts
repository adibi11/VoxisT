import { describe, expect, it, vi } from "vitest";
import {
  createPortalDocumentViewUrlHandler,
  createPortalUploadRequestHandler,
  portalNoStore
} from "../../src/Api/routes/portalRoutes";
import {
  CreatePortalAccessResult,
  ICasePortalAccessRepository,
  PortalCaseRecord,
  ResolvedPortalAccess,
  RevokePortalAccessResult
} from "../../src/dataClients/SqlClient/Repositories/CasePortalAccessRepo/ICasePortalAccessRepository";
import { NullLogger } from "../../src/logging/logger";
import { hashPortalAccessToken, PortalAccessService } from "../../src/Portal/PortalAccessService";
import { mapClientPortal, portalResourceId } from "../../src/Portal/portalMapper";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const TOKEN_A = "a".repeat(43);
const TOKEN_B = "b".repeat(43);
const HASH_A = hashPortalAccessToken(TOKEN_A);
const HASH_B = hashPortalAccessToken(TOKEN_B);

function portalCase(caseId: number, requirementId: number, documentId: number): PortalCaseRecord {
  return {
    id: caseId,
    businessId: caseId === 20 ? 7 : 8,
    name: caseId === 20 ? "Mortgage Case" : "Other Case",
    status: "IN_PROGRESS",
    clientDisplayName: caseId === 20 ? "Ada Client" : "Other Client",
    advisorDisplayName: "Dana Advisor",
    requirements: [
      {
        id: requirementId,
        label: "Payslip – May 2026",
        required: true,
        schemaName: "Payslip V1",
        documentTypeName: "Payslip",
        category: "Income",
        documents: [{
          id: documentId,
          filename: "payslip.pdf",
          status: "NEEDS_REVIEW",
          createdAt: NOW,
          requirementAnswer: {
            secretExtractedPii: "must-not-leak",
            documentMatch: { matches: false, detectedType: "Bank statement" }
          }
        }]
      },
      {
        id: requirementId + 1,
        label: "Payslip – June 2026",
        required: true,
        schemaName: "Payslip V1",
        documentTypeName: "Payslip",
        category: "Income",
        documents: []
      }
    ]
  };
}

class MemoryPortalRepository implements ICasePortalAccessRepository {
  readonly accesses = new Map<string, ResolvedPortalAccess & { revokedAt: Date | null }>();
  createInput: { tokenHash: string; caseId: number } | null = null;

  async createAccess(
    _businessId: number,
    caseId: number,
    tokenHash: string,
    expiresAt: Date
  ): Promise<CreatePortalAccessResult> {
    this.createInput = { tokenHash, caseId };
    return { outcome: "created", access: { id: 1, expiresAt } };
  }

  async resolveActiveAccess(tokenHash: string, now: Date): Promise<ResolvedPortalAccess | null> {
    const access = this.accesses.get(tokenHash);
    if (!access || access.revokedAt || access.expiresAt <= now) return null;
    return access;
  }

  async revokeAccess(_businessId: number, _caseId: number, _now: Date): Promise<RevokePortalAccessResult> {
    return { outcome: "revoked", revokedCount: 1 };
  }
}

function accessFor(tokenHash: string, caseRecord: PortalCaseRecord): ResolvedPortalAccess & { revokedAt: Date | null } {
  return {
    id: 1,
    tokenHash,
    expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null,
    case: caseRecord
  };
}

function response() {
  const res: any = {
    statusCode: 0,
    body: undefined,
    headers: {} as Record<string, string>,
    status: vi.fn((statusCode: number) => { res.statusCode = statusCode; return res; }),
    json: vi.fn((body: unknown) => { res.body = body; return res; }),
    send: vi.fn(() => res),
    setHeader: vi.fn((name: string, value: string) => { res.headers[name] = value; })
  };
  return res;
}

describe("portal access lifecycle", () => {
  it("stores only the token hash and resolves the correct Case", async () => {
    const repository = new MemoryPortalRepository();
    const service = new PortalAccessService(repository, () => NOW, () => TOKEN_A);
    const created = await service.createAccess(7, 20);
    expect(created?.accessToken).toBe(TOKEN_A);
    expect(repository.createInput).toEqual({ tokenHash: HASH_A, caseId: 20 });
    expect(JSON.stringify(repository.createInput)).not.toContain(TOKEN_A);

    repository.accesses.set(HASH_A, accessFor(HASH_A, portalCase(20, 101, 501)));
    expect((await service.resolveAccess(TOKEN_A))?.case.id).toBe(20);
  });

  it("rejects unknown, expired, and revoked tokens", async () => {
    const repository = new MemoryPortalRepository();
    const service = new PortalAccessService(repository, () => NOW);
    expect(await service.resolveAccess(TOKEN_A)).toBeNull();

    const expired = accessFor(HASH_A, portalCase(20, 101, 501));
    expired.expiresAt = new Date(NOW.getTime() - 1);
    repository.accesses.set(HASH_A, expired);
    expect(await service.resolveAccess(TOKEN_A)).toBeNull();

    const revoked = accessFor(HASH_A, portalCase(20, 101, 501));
    revoked.revokedAt = NOW;
    repository.accesses.set(HASH_A, revoked);
    expect(await service.resolveAccess(TOKEN_A)).toBeNull();
  });
});

describe("portal DTO", () => {
  it("prefers slot labels, keeps same-schema slots separate, and omits internal data", () => {
    const dto = mapClientPortal(portalCase(20, 101, 501), HASH_A);
    expect(dto.requirements.map((item) => item.label)).toEqual([
      "Payslip – May 2026",
      "Payslip – June 2026"
    ]);
    expect(dto.requirements).toHaveLength(2);
    expect(dto.requirements[0].id).toMatch(/^req_[A-Za-z0-9_-]{43}$/);
    expect(dto.requirements[0].documents[0]).toMatchObject({
      filename: "payslip.pdf",
      status: "NEEDS_REVIEW",
      message: "The uploaded file may not match the requested document."
    });
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("secretExtractedPii");
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("businessId");
    expect(serialized).not.toContain('"id":101');
    expect(serialized).not.toContain('"id":501');
  });
});

describe("portal cross-case authorization", () => {
  function serviceForCaseA() {
    const repository = new MemoryPortalRepository();
    repository.accesses.set(HASH_A, accessFor(HASH_A, portalCase(20, 101, 501)));
    return new PortalAccessService(repository, () => NOW);
  }

  it("does not allow Token A to upload to a Case B requirement", async () => {
    const documents = {
      getUploadContext: vi.fn(),
      reserveDocumentId: vi.fn(),
      createPendingDocument: vi.fn()
    };
    const storage = { createUploadUrl: vi.fn() };
    const handler = createPortalUploadRequestHandler(
      serviceForCaseA(),
      { documentRepository: documents } as any,
      storage as any,
      new NullLogger()
    );
    const res = response();
    await handler({
      params: {
        accessToken: TOKEN_A,
        requirementId: portalResourceId(HASH_A, "requirement", 202)
      },
      body: { filename: "other.pdf", mimeType: "application/pdf", sizeBytes: 100 }
    } as any, res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(documents.getUploadContext).not.toHaveBeenCalled();
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
  });

  it("does not allow Token A to view a Case B document", async () => {
    const documents = { findViewableByCaseId: vi.fn() };
    const storage = { createViewUrl: vi.fn() };
    const handler = createPortalDocumentViewUrlHandler(
      serviceForCaseA(),
      { documentRepository: documents } as any,
      storage as any,
      new NullLogger()
    );
    const res = response();
    await handler({
      params: {
        accessToken: TOKEN_A,
        documentId: portalResourceId(HASH_A, "document", 902)
      }
    } as any, res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(documents.findViewableByCaseId).not.toHaveBeenCalled();
    expect(storage.createViewUrl).not.toHaveBeenCalled();
  });
});

describe("portal upload", () => {
  it("persists CLIENT_PORTAL with no AppUser and preserves MIME/size validation", async () => {
    const repository = new MemoryPortalRepository();
    repository.accesses.set(HASH_A, accessFor(HASH_A, portalCase(20, 101, 501)));
    const documents = {
      getUploadContext: vi.fn().mockResolvedValue({ caseId: 20, schemaId: 10, documentTypeId: 3 }),
      reserveDocumentId: vi.fn().mockResolvedValue(700),
      createPendingDocument: vi.fn().mockImplementation(async (input: any) => ({
        id: 700,
        filename: input.filename,
        status: "PENDING_UPLOAD",
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes
      }))
    };
    const storage = { createUploadUrl: vi.fn().mockResolvedValue("https://upload.example/signed") };
    const handler = createPortalUploadRequestHandler(
      new PortalAccessService(repository, () => NOW),
      { documentRepository: documents } as any,
      storage as any,
      new NullLogger()
    );
    const res = response();
    await handler({
      params: {
        accessToken: TOKEN_A,
        requirementId: portalResourceId(HASH_A, "requirement", 101)
      },
      body: { filename: "payslip.pdf", mimeType: "application/pdf", sizeBytes: 100 }
    } as any, res, vi.fn());

    expect(res.statusCode).toBe(201);
    expect(documents.createPendingDocument).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 20,
      caseDocumentSpecificationId: 101,
      source: "CLIENT_PORTAL",
      uploadedById: null
    }));
    expect(res.body.document.id).toMatch(/^doc_[A-Za-z0-9_-]{43}$/);

    const invalid = response();
    await handler({
      params: { accessToken: TOKEN_A, requirementId: portalResourceId(HASH_A, "requirement", 101) },
      body: { filename: "bad.exe", mimeType: "application/octet-stream", sizeBytes: 100 }
    } as any, invalid, vi.fn());
    expect(invalid.statusCode).toBe(400);
  });

  it("marks portal responses as non-cacheable", () => {
    const res = response();
    const next = vi.fn();
    portalNoStore({} as any, res, next);
    expect(res.headers).toMatchObject({ "Cache-Control": "no-store", Pragma: "no-cache" });
    expect(next).toHaveBeenCalledOnce();
  });
});
