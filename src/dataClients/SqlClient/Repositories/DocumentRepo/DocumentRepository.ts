import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import { DocumentRequirementAnswer } from "../../../../Documents/documentProcessingTypes";
import { DocumentStorageRecord, DocumentUploadContext, IDocumentRepository, PendingDocument, PendingDocumentInput, ProcessingDocument, ViewableDocument } from "./IDocumentRepository";

export class DocumentRepository implements IDocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async reserveDocumentId(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ id: bigint }>>`
      SELECT nextval(pg_get_serial_sequence('"Document"', 'id')) AS id
    `;
    const id = Number(rows[0]?.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Failed to reserve Document ID");
    return id;
  }
  async getUploadContext(businessId: number, caseId: number, specificationId: number): Promise<DocumentUploadContext | null> {
    const specification = await this.prisma.caseDocumentSpecification.findFirst({
      where: { id: specificationId, caseId, case: { businessId } },
      select: { caseId: true, schemaId: true, schema: { select: { documentTypeId: true } } }
    });
    return specification ? { caseId: specification.caseId, schemaId: specification.schemaId,
      documentTypeId: specification.schema.documentTypeId } : null;
  }
  async createPendingDocument(input: PendingDocumentInput): Promise<PendingDocument> {
    const document = await this.prisma.document.create({
      data: { id: input.id, caseId: input.caseId, 
        caseDocumentSpecificationId: input.caseDocumentSpecificationId,
        schemaId: input.schemaId, 
        documentTypeId: input.documentTypeId, 
        filename: input.filename,
        storageKey: input.storageKey, 
        mimeType: input.mimeType, 
        sizeBytes: input.sizeBytes,
        status: "PENDING_UPLOAD", 
        source: input.source, uploadedById: input.uploadedById },
      select: { id: true, filename: true, status: true, mimeType: true, sizeBytes: true }
    });
    return { ...document, status: "PENDING_UPLOAD" };
  }

  async findByStorageKey(storageKey: string): Promise<DocumentStorageRecord | null> {
    return this.prisma.document.findUnique({
      where: { storageKey },
      select: { id: true, status: true }
    });
  }

  async markUploaded(documentId: number): Promise<boolean> {
    const result = await this.prisma.document.updateMany({
      where: { id: documentId, status: "PENDING_UPLOAD" },
      data: { status: "UPLOADED" }
    });
    return result.count === 1;
  }

  async findViewableById(businessId: number, documentId: number): Promise<ViewableDocument | null> {
    return this.prisma.document.findFirst({
      where: { id: documentId, case: { businessId } },
      select: { id: true, storageKey: true, filename: true, mimeType: true }
    });
  }

  async findViewableByCaseId(caseId: number, documentId: number): Promise<ViewableDocument | null> {
    return this.prisma.document.findFirst({
      where: { id: documentId, caseId },
      select: { id: true, storageKey: true, filename: true, mimeType: true }
    });
  }

  async claimForProcessing(documentId: number): Promise<ProcessingDocument | null> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.document.updateMany({
        where: { id: documentId, status: "UPLOADED" },
        data: { status: "PROCESSING" }
      });
      if (claimed.count !== 1) return null;
      const document = await tx.document.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          storageKey: true,
          filename: true,
          mimeType: true,
          case: { select: { business: { select: { language: true } } } },
          schema: {
            select: {
              name: true,
              requirementSchema: true,
              documentType: { select: { name: true } }
            }
          }
        }
      });
      if (!document) throw new Error("Claimed Document could not be loaded");
      return {
        id: document.id,
        storageKey: document.storageKey,
        filename: document.filename,
        mimeType: document.mimeType,
        businessLanguage: document.case.business.language,
        schemaName: document.schema?.name ?? null,
        documentTypeName: document.schema?.documentType.name ?? null,
        requirementSchema: document.schema?.requirementSchema ?? null
      };
    });
  }

  async completeProcessing(
    documentId: number,
    answer: DocumentRequirementAnswer,
    status: "EXTRACTED" | "NEEDS_REVIEW"
  ): Promise<boolean> {
    const result = await this.prisma.document.updateMany({
      where: { id: documentId, status: "PROCESSING" },
      data: {
        requirementAnswer: JSON.parse(JSON.stringify(answer)) as Prisma.InputJsonValue,
        status
      }
    });
    return result.count === 1;
  }

  async completeUnknownProcessing(documentId: number): Promise<boolean> {
    const result = await this.prisma.document.updateMany({ where: { id: documentId, status: "PROCESSING", schemaId: null, documentTypeId: null, caseDocumentSpecificationId: null }, data: { status: "NEEDS_REVIEW" } });
    return result.count === 1;
  }

  async markProcessingFailed(documentId: number): Promise<boolean> {
    const result = await this.prisma.document.updateMany({
      where: { id: documentId, status: "PROCESSING" },
      data: { status: "FAILED" }
    });
    return result.count === 1;
  }

  async verifyNeedsReviewDocument(
    businessId: number,
    caseId: number,
    documentId: number
  ): Promise<"verified" | "not_found" | "not_reviewable"> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, caseId, case: { businessId } },
      select: { status: true }
    });
    if (!document) return "not_found";
    if (document.status !== "NEEDS_REVIEW") return "not_reviewable";

    const updated = await this.prisma.document.updateMany({
      where: {
        id: documentId,
        caseId,
        case: { businessId },
        status: "NEEDS_REVIEW"
      },
      data: { status: "VERIFIED" }
    });
    return updated.count === 1 ? "verified" : "not_reviewable";
  }
}


