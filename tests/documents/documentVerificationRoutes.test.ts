import { describe, expect, it, vi } from "vitest";
import { verifyDocumentHandler } from "../../src/Api/routes/documentRoutes";
import { DocumentRepository } from "../../src/dataClients/SqlClient/Repositories/DocumentRepo/DocumentRepository";
import { NullLogger } from "../../src/logging/logger";

function request(overrides: Record<string, unknown> = {}) {
  return {
    params: { caseId: "20", documentId: "50" },
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

describe("document verification route", () => {
  it("returns VERIFIED after a NEEDS_REVIEW document is verified", async () => {
    const documents = { verifyNeedsReviewDocument: vi.fn().mockResolvedValue("verified") };
    const res = response();

    await verifyDocumentHandler(documents as any, new NullLogger())(request(), res, vi.fn());

    expect(documents.verifyNeedsReviewDocument).toHaveBeenCalledWith(7, 20, 50);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: 50, status: "VERIFIED" });
  });

  it("does not verify a document belonging to another case", async () => {
    const documents = { verifyNeedsReviewDocument: vi.fn().mockResolvedValue("not_found") };
    const res = response();

    await verifyDocumentHandler(documents as any, new NullLogger())(request(), res, vi.fn());

    expect(res.statusCode).toBe(404);
  });

  it("denies a business the authenticated user cannot access", async () => {
    const documents = { verifyNeedsReviewDocument: vi.fn() };
    const res = response();

    await verifyDocumentHandler(documents as any, new NullLogger())(
      request({ header: (name: string) => name === "X-Business-Id" ? "8" : undefined }),
      res,
      vi.fn()
    );

    expect(res.statusCode).toBe(403);
    expect(documents.verifyNeedsReviewDocument).not.toHaveBeenCalled();
  });

  it.each(["FAILED", "PROCESSING", "EXTRACTED", "VERIFIED"])(
    "returns conflict when the document is already %s",
    async () => {
      const documents = { verifyNeedsReviewDocument: vi.fn().mockResolvedValue("not_reviewable") };
      const res = response();

      await verifyDocumentHandler(documents as any, new NullLogger())(request(), res, vi.fn());

      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({ code: "CONFLICT", message: "Document is not awaiting review" });
    }
  );

  it.each([
    { caseId: "0", documentId: "50" },
    { caseId: "20", documentId: "invalid" }
  ])("rejects invalid identifiers", async (params) => {
    const documents = { verifyNeedsReviewDocument: vi.fn() };
    const res = response();

    await verifyDocumentHandler(documents as any, new NullLogger())(request({ params }), res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(documents.verifyNeedsReviewDocument).not.toHaveBeenCalled();
  });
});

describe("DocumentRepository.verifyNeedsReviewDocument", () => {
  it("changes only the matching NEEDS_REVIEW document", async () => {
    const findFirst = vi.fn().mockResolvedValue({ status: "NEEDS_REVIEW" });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new DocumentRepository({ document: { findFirst, updateMany } } as any);

    await expect(repository.verifyNeedsReviewDocument(7, 20, 50)).resolves.toBe("verified");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 50, caseId: 20, case: { businessId: 7 } },
      select: { status: true }
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 50, caseId: 20, case: { businessId: 7 }, status: "NEEDS_REVIEW" },
      data: { status: "VERIFIED" }
    });
  });

  it("does not update a document outside the requested case and business", async () => {
    const updateMany = vi.fn();
    const repository = new DocumentRepository({
      document: { findFirst: vi.fn().mockResolvedValue(null), updateMany }
    } as any);

    await expect(repository.verifyNeedsReviewDocument(7, 20, 50)).resolves.toBe("not_found");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each(["FAILED", "PROCESSING", "EXTRACTED", "VERIFIED"])(
    "does not update a document in %s",
    async (status) => {
      const updateMany = vi.fn();
      const repository = new DocumentRepository({
        document: { findFirst: vi.fn().mockResolvedValue({ status }), updateMany }
      } as any);

      await expect(repository.verifyNeedsReviewDocument(7, 20, 50)).resolves.toBe("not_reviewable");
      expect(updateMany).not.toHaveBeenCalled();
    }
  );

  it("reports a conflict when the conditional update loses a status race", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const repository = new DocumentRepository({
      document: { findFirst: vi.fn().mockResolvedValue({ status: "NEEDS_REVIEW" }), updateMany }
    } as any);

    await expect(repository.verifyNeedsReviewDocument(7, 20, 50)).resolves.toBe("not_reviewable");
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "NEEDS_REVIEW" }),
      data: { status: "VERIFIED" }
    }));
  });
});
