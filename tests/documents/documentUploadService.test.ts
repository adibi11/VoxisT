import { describe, expect, it, vi } from "vitest";
import { DocumentUploadService, isValidDocumentUploadRequest, sanitizeFilename } from "../../src/Documents/DocumentUploadService";
import { DocumentRepository } from "../../src/dataClients/SqlClient/Repositories/DocumentRepo/DocumentRepository";

const request = { caseDocumentSpecificationId: 12, filename: "salary-slip.pdf",
  mimeType: "application/pdf" as const, sizeBytes: 483920 };

function collaborators() {
  const repository = {
    reserveDocumentId: vi.fn().mockResolvedValue(50),
    getUploadContext: vi.fn().mockResolvedValue({ caseId: 20, schemaId: 30, documentTypeId: 40 }),
    createPendingDocument: vi.fn().mockImplementation(async (input: any) => ({ id: 50,
      filename: input.filename, status: "PENDING_UPLOAD", mimeType: input.mimeType, sizeBytes: input.sizeBytes }))
  };
  const storage = { createUploadUrl: vi.fn().mockResolvedValue("https://upload.example/signed") };
  return { repository, storage };
}

describe("DocumentUploadService", () => {
  it("prepares a successful upload request and persists PENDING_UPLOAD", async () => {
    const { repository, storage } = collaborators();
    const result = await new DocumentUploadService(repository, storage).prepareUpload(7, 20, { source: "ADVISOR_UPLOAD", uploadedById: 9 }, request);
    expect(result).toEqual({ outcome: "created", response: {
      document: { id: 50, filename: "salary-slip.pdf", status: "PENDING_UPLOAD", mimeType: "application/pdf", sizeBytes: 483920 },
      upload: { url: "https://upload.example/signed", method: "PUT", expiresInSeconds: 300 }
    }});
    expect(repository.createPendingDocument).toHaveBeenCalledWith(expect.objectContaining({
      schemaId: 30, documentTypeId: 40, uploadedById: 9
    }));
  });

  it.each(["case from another business", "specification from another Case"])("rejects %s", async () => {
    const { repository, storage } = collaborators();
    repository.getUploadContext.mockResolvedValue(null);
    const result = await new DocumentUploadService(repository, storage).prepareUpload(7, 20, { source: "ADVISOR_UPLOAD", uploadedById: 9 }, request);
    expect(result).toEqual({ outcome: "not_found" });
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
    expect(repository.createPendingDocument).not.toHaveBeenCalled();
  });

  it("generates the storage key server-side and sanitizes path manipulation", async () => {
    const { repository, storage } = collaborators();
    await new DocumentUploadService(repository, storage).prepareUpload(7, 20, { source: "ADVISOR_UPLOAD", uploadedById: 9 },
      { ...request, filename: "../../salary slip.pdf", storageKey: "caller/key" } as any);
    const key = storage.createUploadUrl.mock.calls[0][0].storageKey;
    expect(key).toMatch(/^businesses\/7\/cases\/20\/documents\/[0-9a-f-]+\/salary_slip\.pdf$/);
    expect(key).not.toContain("caller/key");
    expect(repository.createPendingDocument).toHaveBeenCalledWith(expect.objectContaining({ storageKey: key }));
  });

  it("does not persist when presigning fails", async () => {
    const { repository, storage } = collaborators();
    storage.createUploadUrl.mockRejectedValue(new Error("S3 unavailable"));
    await expect(new DocumentUploadService(repository, storage).prepareUpload(7, 20, { source: "ADVISOR_UPLOAD", uploadedById: 9 }, request)).rejects.toThrow("S3 unavailable");
    expect(repository.createPendingDocument).not.toHaveBeenCalled();
  });
});

describe("upload request validation", () => {
  it("rejects unsupported MIME types", () => expect(isValidDocumentUploadRequest({ ...request, mimeType: "text/plain" } as any)).toBe(false));
  it.each([0, -1, 25 * 1024 * 1024 + 1])("rejects invalid size %s", (sizeBytes) =>
    expect(isValidDocumentUploadRequest({ ...request, sizeBytes })).toBe(false));
  it("sanitizes filenames", () => expect(sanitizeFilename("../a nice.pdf")).toBe("a_nice.pdf"));
});

describe("DocumentRepository", () => {
  it("derives schema/document type and explicitly persists server-owned fields", async () => {
    let createData: any;
    const repository = new DocumentRepository({
      $queryRaw: async () => [{ id: 50n }],
      caseDocumentSpecification: { findFirst: async () => ({ caseId: 20, schemaId: 30, schema: { documentTypeId: 40 } }) },
      document: { create: async ({ data }: any) => { createData = data; return { id: 50, filename: data.filename,
        status: data.status, mimeType: data.mimeType, sizeBytes: data.sizeBytes }; } }
    } as any);
    expect(await repository.reserveDocumentId()).toBe(50);
    expect(await repository.getUploadContext(7, 20, 12)).toEqual({ caseId: 20, schemaId: 30, documentTypeId: 40 });
    await repository.createPendingDocument({ id: 50, caseId: 20, caseDocumentSpecificationId: 12, schemaId: 30,
      documentTypeId: 40, filename: "salary.pdf", storageKey: "generated", mimeType: "application/pdf", sizeBytes: 10, uploadedById: 9, source: "ADVISOR_UPLOAD" });
    expect(createData).toMatchObject({ status: "PENDING_UPLOAD", source: "ADVISOR_UPLOAD", schemaId: 30, documentTypeId: 40 });
  });
});
