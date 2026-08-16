import { describe, expect, it, vi } from "vitest";
import { createDocumentViewUrlHandler } from "../../src/Api/routes/documentRoutes";
import { NullLogger } from "../../src/logging/logger";

function request(overrides: Record<string, unknown> = {}) {
  return {
    params: { documentId: "50" },
    body: {},
    query: {},
    header: (name: string) => name === "X-Business-Id" ? "7" : undefined,
    auth: {
      userId: 9,
      platformRole: "user",
      businessIds: [7],
      businessMemberships: [{ businessId: 7, role: "member" }]
    },
    ...overrides
  } as any;
}

function response() {
  const res: any = {
    statusCode: 0,
    body: undefined,
    status: vi.fn((statusCode: number) => { res.statusCode = statusCode; return res; }),
    json: vi.fn((body: unknown) => { res.body = body; return res; })
  };
  return res;
}

function collaborators() {
  const documents = {
    findViewableById: vi.fn().mockResolvedValue({
      id: 50,
      storageKey: "businesses/7/cases/20/documents/50/salary-slip.pdf",
      filename: "salary-slip.pdf",
      mimeType: "application/pdf"
    })
  };
  const storage = { createViewUrl: vi.fn().mockResolvedValue("https://view.example/signed") };
  return { documents, storage };
}

describe("document view URL handler", () => {
  it("returns a short-lived presigned GET URL for a valid Document", async () => {
    const { documents, storage } = collaborators();
    const res = response();
    await createDocumentViewUrlHandler(documents as any, new NullLogger(), storage as any)(request(), res, vi.fn());
    expect(documents.findViewableById).toHaveBeenCalledWith(7, 50);
    expect(storage.createViewUrl).toHaveBeenCalledWith({
      storageKey: "businesses/7/cases/20/documents/50/salary-slip.pdf",
      expiresInSeconds: 300
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      url: "https://view.example/signed",
      expiresInSeconds: 300,
      mimeType: "application/pdf",
      filename: "salary-slip.pdf"
    });
  });

  it("rejects a Document owned by another Business", async () => {
    const { documents, storage } = collaborators();
    documents.findViewableById.mockResolvedValue(null);
    const res = response();
    await createDocumentViewUrlHandler(documents as any, new NullLogger(), storage as any)(request(), res, vi.fn());
    expect(documents.findViewableById).toHaveBeenCalledWith(7, 50);
    expect(storage.createViewUrl).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for a missing Document", async () => {
    const { documents, storage } = collaborators();
    documents.findViewableById.mockResolvedValue(null);
    const res = response();
    await createDocumentViewUrlHandler(documents as any, new NullLogger(), storage as any)(
      request({ params: { documentId: "999" } }), res, vi.fn()
    );
    expect(storage.createViewUrl).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ code: "NOT_FOUND", message: "Document not found" });
  });

  it("returns 500 when S3 presigning fails", async () => {
    const { documents, storage } = collaborators();
    storage.createViewUrl.mockRejectedValue(new Error("S3 unavailable"));
    const res = response();
    await createDocumentViewUrlHandler(documents as any, new NullLogger(), storage as any)(request(), res, vi.fn());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: "Failed to create document view URL" });
  });

  it("ignores caller storage fields and never exposes storageKey", async () => {
    const { documents, storage } = collaborators();
    const res = response();
    await createDocumentViewUrlHandler(documents as any, new NullLogger(), storage as any)(request({
      body: { storageKey: "attacker/key", bucket: "public", businessId: 8, caseId: 99 },
      query: { storageKey: "attacker/query-key" }
    }), res, vi.fn());
    expect(storage.createViewUrl).toHaveBeenCalledWith(expect.objectContaining({
      storageKey: "businesses/7/cases/20/documents/50/salary-slip.pdf"
    }));
    expect(JSON.stringify(res.body)).not.toContain("storageKey");
    expect(JSON.stringify(res.body)).not.toContain("attacker");
  });
});
