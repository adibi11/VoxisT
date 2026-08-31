import { describe, expect, it, vi } from "vitest";
import { InboundEmailRepository } from "../../src/dataClients/SqlClient/Repositories/InboundEmailRepo/InboundEmailRepository";
import { DocumentRepository } from "../../src/dataClients/SqlClient/Repositories/DocumentRepo/DocumentRepository";

describe("InboundEmailRepository Case routing", () => {
  it("loads configured Business.language with the resolved Case route", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 20, businessId: 7, business: { language: "he" } });
    const repository = new InboundEmailRepository({ case: { findUnique } } as any);
    await expect(repository.resolveCaseToken("token")).resolves.toEqual({ caseId: 20, businessId: 7, businessLanguage: "he" });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ business: { select: { language: true } } })
    }));
  });

  it("returns the existing Case token idempotently", async () => {
    const prisma = { case: { findFirst: vi.fn().mockResolvedValue({ inboundEmailToken: "a".repeat(64) }), updateMany: vi.fn() } };
    await expect(new InboundEmailRepository(prisma as any).getOrCreateCaseToken(7, 20, () => "b".repeat(64))).resolves.toBe("a".repeat(64));
    expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 20, businessId: 7 } }));
    expect(prisma.case.updateMany).not.toHaveBeenCalled();
  });
  it("returns null when the Case does not belong to the business", async () => {
    const prisma = { case: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn() } };
    await expect(new InboundEmailRepository(prisma as any).getOrCreateCaseToken(8, 20, () => "b".repeat(64))).resolves.toBeNull();
  });
  it("reloads the winning token after a concurrent creator", async () => {
    const prisma = { case: { findFirst: vi.fn().mockResolvedValueOnce({ inboundEmailToken: null }).mockResolvedValue({ inboundEmailToken: "c".repeat(64) }), updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    await expect(new InboundEmailRepository(prisma as any).getOrCreateCaseToken(7, 20, () => "b".repeat(64))).resolves.toBe("c".repeat(64));
  });
});

describe("DocumentRepository unknown processing", () => {
  it("claims a schema-less document for the canonical processor", async () => {
    const tx = { document: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: vi.fn().mockResolvedValue({ id: 50, storageKey: "key", filename: "unknown.pdf", mimeType: "application/pdf", case: { business: { language: "he" } }, schema: null }) } };
    const repository = new DocumentRepository({ $transaction: (callback: any) => callback(tx) } as any);
    await expect(repository.claimForProcessing(50)).resolves.toEqual({ id: 50, storageKey: "key", filename: "unknown.pdf", mimeType: "application/pdf", businessLanguage: "he", schemaName: null, documentTypeName: null, requirementSchema: null });
  });
});


describe("InboundEmailRepository document classification linkage", () => {
  it("returns only current unoccupied requirement classification fields", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 12, label: "תלוש יולי", schema: { name: "תלוש V1", documentType: { name: "תלוש שכר", category: "שכר" } } }]);
    const repository = new InboundEmailRepository({ caseDocumentSpecification: { findMany } } as any);
    await expect(repository.listNeededDocumentCandidates(7, 20)).resolves.toEqual([{
      caseDocumentSpecificationId: 12, documentTypeName: "תלוש שכר", schemaName: "תלוש V1", documentTypeCategory: "שכר", label: "תלוש יולי"
    }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ caseId: 20, case: { businessId: 7 }, documents: { none: { status: { in: ["PENDING_UPLOAD", "UPLOADED", "PROCESSING", "EXTRACTED", "NEEDS_REVIEW", "VERIFIED"] } } } })
    }));
  });

  it("revalidates and derives schema linkage inside document creation", async () => {
    const create = vi.fn().mockImplementation(async ({ data }) => ({ id: data.id, storageKey: data.storageKey, status: data.status }));
    const tx = {
      inboundEmailReceipt: { findFirst: vi.fn().mockResolvedValue({ id: 4 }) },
      document: { findUnique: vi.fn().mockResolvedValue(null), create },
      caseDocumentSpecification: { findFirst: vi.fn().mockResolvedValue({ id: 12, schemaId: 22, schema: { documentTypeId: 32 } }) },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([{ id: 50n }])
    };
    const repository = new InboundEmailRepository({ $transaction: (callback: any) => callback(tx) } as any);
    await repository.getOrCreateAttachmentDocument({ receiptId: 4, attachmentIndex: 0, businessId: 7, caseId: 20, filename: "slip.pdf", mimeType: "application/pdf", sizeBytes: 10, caseDocumentSpecificationId: 12 });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.caseDocumentSpecification.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 12, caseId: 20, case: { businessId: 7 } }) }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ caseDocumentSpecificationId: 12, schemaId: 22, documentTypeId: 32 }) }));
  });

  it("creates an unassigned document when the selected requirement became occupied", async () => {
    const create = vi.fn().mockImplementation(async ({ data }) => ({ id: data.id, storageKey: data.storageKey, status: data.status }));
    const tx = {
      inboundEmailReceipt: { findFirst: vi.fn().mockResolvedValue({ id: 4 }) },
      document: { findUnique: vi.fn().mockResolvedValue(null), create },
      caseDocumentSpecification: { findFirst: vi.fn().mockResolvedValue(null) },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([{ id: 50n }])
    };
    const repository = new InboundEmailRepository({ $transaction: (callback: any) => callback(tx) } as any);
    await repository.getOrCreateAttachmentDocument({ receiptId: 4, attachmentIndex: 0, businessId: 7, caseId: 20, filename: "slip.pdf", mimeType: "application/pdf", sizeBytes: 10, caseDocumentSpecificationId: 12 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ caseDocumentSpecificationId: null, schemaId: null, documentTypeId: null }) }));
  });
});
