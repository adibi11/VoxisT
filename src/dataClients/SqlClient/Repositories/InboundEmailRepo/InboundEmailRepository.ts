import { PrismaClient } from "../../../../generated/prisma/client";
import { EmailDocumentRecord, IInboundEmailRepository, ReceiptClaim } from "../../../../InboundEmail/inboundEmailTypes";

export class InboundEmailRepository implements IInboundEmailRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreateCaseToken(businessId: number, caseId: number, tokenFactory: () => string): Promise<string | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await this.prisma.case.findFirst({ where: { id: caseId, businessId }, select: { inboundEmailToken: true } });
      if (!existing) return null;
      if (existing.inboundEmailToken) return existing.inboundEmailToken;
      const token = tokenFactory();
      try {
        const updated = await this.prisma.case.updateMany({
          where: { id: caseId, businessId, inboundEmailToken: null }, data: { inboundEmailToken: token }
        });
        if (updated.count === 1) return token;
      } catch (error: any) {
        if (error?.code !== "P2002") throw error;
      }
    }
    const winner = await this.prisma.case.findFirst({ where: { id: caseId, businessId }, select: { inboundEmailToken: true } });
    if (winner?.inboundEmailToken) return winner.inboundEmailToken;
    throw new Error("Unable to allocate a unique inbound email token");
  }

  async resolveCaseToken(token: string) {
    const row = await this.prisma.case.findUnique({
      where: { inboundEmailToken: token },
      select: { id: true, businessId: true, business: { select: { language: true } } }
    });
    return row ? { caseId: row.id, businessId: row.businessId, businessLanguage: row.business.language } : null;
  }

  async claimReceipt(input: { providerMessageId: string; rawStorageKey: string; businessId: number; caseId: number }): Promise<ReceiptClaim> {
    return this.prisma.$transaction(async (tx) => {
      let receipt = await tx.inboundEmailReceipt.findFirst({
        where: { OR: [{ providerMessageId: input.providerMessageId }, { rawStorageKey: input.rawStorageKey }] },
        select: { id: true, businessId: true, caseId: true, status: true, updatedAt: true }
      });
      if (!receipt) {
        receipt = await tx.inboundEmailReceipt.create({ data: input, select: { id: true, businessId: true, caseId: true, status: true, updatedAt: true } });
      }
      if (receipt.businessId !== input.businessId || receipt.caseId !== input.caseId) throw new Error("Inbound receipt tenant mismatch");
      if (receipt.status === "PROCESSED" || receipt.status === "REJECTED") return { outcome: "processed" };
      const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
      if (receipt.status === "PROCESSING" && receipt.updatedAt >= staleBefore) return { outcome: "busy" };
      const claimed = await tx.inboundEmailReceipt.updateMany({
        where: { id: receipt.id, OR: [{ status: { in: ["RECEIVED", "FAILED"] } }, { status: "PROCESSING", updatedAt: { lt: staleBefore } }] },
        data: { status: "PROCESSING", failureReason: null }
      });
      return claimed.count === 1 ? { outcome: "claimed", receiptId: receipt.id } : { outcome: "busy" };
    });
  }

  async listNeededDocumentCandidates(businessId: number, caseId: number) {
    const rows = await this.prisma.caseDocumentSpecification.findMany({
      where: {
        caseId,
        case: { businessId },
        documents: {
          none: {
            status: { in: ["PENDING_UPLOAD", "UPLOADED", "PROCESSING", "EXTRACTED", "NEEDS_REVIEW", "VERIFIED"] }
          }
        }
      },
      select: {
        id: true,
        label: true,
        schema: { select: { name: true, documentType: { select: { name: true, category: true } } } }
      },
      orderBy: { id: "asc" }
    });
    return rows.map((row) => ({
      caseDocumentSpecificationId: row.id,
      documentTypeName: row.schema.documentType.name,
      schemaName: row.schema.name,
      documentTypeCategory: row.schema.documentType.category,
      label: row.label
    }));
  }

  async getOrCreateAttachmentDocument(input: {
    receiptId: number; attachmentIndex: number; businessId: number; caseId: number;
    filename: string; mimeType: string; sizeBytes: number; caseDocumentSpecificationId: number | null;
  }): Promise<EmailDocumentRecord> {
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.inboundEmailReceipt.findFirst({
        where: { id: input.receiptId, businessId: input.businessId, caseId: input.caseId, status: "PROCESSING" }, select: { id: true }
      });
      if (!receipt) throw new Error("Inbound receipt is not processable for this tenant");
      const existing = await tx.document.findUnique({
        where: { inboundEmailReceiptId_inboundAttachmentIndex: { inboundEmailReceiptId: input.receiptId, inboundAttachmentIndex: input.attachmentIndex } },
        select: { id: true, storageKey: true, status: true }
      });
      if (existing) return existing;
      if (input.caseDocumentSpecificationId !== null) {
        await tx.$executeRaw`SELECT id FROM "CaseDocumentSpecification" WHERE id = ${input.caseDocumentSpecificationId} FOR UPDATE`;
      }
      const specification = input.caseDocumentSpecificationId === null
        ? null
        : await tx.caseDocumentSpecification.findFirst({
            where: {
              id: input.caseDocumentSpecificationId,
              caseId: input.caseId,
              case: { businessId: input.businessId },
              documents: {
                none: {
                  status: { in: ["PENDING_UPLOAD", "UPLOADED", "PROCESSING", "EXTRACTED", "NEEDS_REVIEW", "VERIFIED"] }
                }
              }
            },
            select: { id: true, schemaId: true, schema: { select: { documentTypeId: true } } }
          });
      const rows = await tx.$queryRaw<Array<{ id: bigint }>>`SELECT nextval(pg_get_serial_sequence('"Document"', 'id')) AS id`;
      const id = Number(rows[0]?.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Failed to reserve Document ID");
      const storageKey = `businesses/${input.businessId}/cases/${input.caseId}/documents/${id}/${input.filename}`;
      return tx.document.create({
        data: {
          id, caseId: input.caseId, filename: input.filename, storageKey, mimeType: input.mimeType,
          sizeBytes: input.sizeBytes, status: "PENDING_UPLOAD", source: "EMAIL", uploadedById: null,
          documentTypeId: specification?.schema.documentTypeId ?? null,
          schemaId: specification?.schemaId ?? null,
          caseDocumentSpecificationId: specification?.id ?? null,
          inboundEmailReceiptId: input.receiptId, inboundAttachmentIndex: input.attachmentIndex
        },
        select: { id: true, storageKey: true, status: true }
      });
    });
  }

  async markReceiptProcessed(receiptId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const processedAt = new Date();
      const receipt = await tx.inboundEmailReceipt.findFirst({
        where: { id: receiptId, status: "PROCESSING" },
        select: { caseId: true, businessId: true }
      });
      if (!receipt) return;
      const updated = await tx.inboundEmailReceipt.updateMany({
        where: { id: receiptId, status: "PROCESSING" },
        data: { status: "PROCESSED", processedAt }
      });
      if (updated.count === 1) {
        await tx.case.updateMany({
          where: { id: receipt.caseId, businessId: receipt.businessId },
          data: { lastBorrowerInteractionAt: processedAt }
        });
      }
    });
  }
  async markReceiptRejected(receiptId: number, reason: string): Promise<void> {
    await this.prisma.inboundEmailReceipt.updateMany({ where: { id: receiptId, status: "PROCESSING" }, data: { status: "REJECTED", failureReason: reason, processedAt: new Date() } });
  }
  async markReceiptFailed(receiptId: number, reason: string): Promise<void> {
    await this.prisma.inboundEmailReceipt.updateMany({ where: { id: receiptId, status: "PROCESSING" }, data: { status: "FAILED", failureReason: reason.slice(0, 1000) } });
  }
}
