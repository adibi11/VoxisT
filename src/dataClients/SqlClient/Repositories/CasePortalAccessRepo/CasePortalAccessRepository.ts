import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import {
  CreatePortalAccessResult,
  ICasePortalAccessRepository,
  FindActivePortalAccessResult,
  PortalCaseRecord,
  ResolvedPortalAccess,
  RevokePortalAccessResult
} from "./ICasePortalAccessRepository";

const portalAccessInclude = {
  case: {
    include: {
      lead: { include: { client: true } },
      assignee: { select: { displayName: true } },
      documentSpecifications: {
        include: {
          schema: { include: { documentType: true } },
          documents: {
            select: { id: true, filename: true, status: true, createdAt: true, requirementAnswer: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }]
          }
        },
        orderBy: { id: "asc" }
      }
    }
  }
} satisfies Prisma.CasePortalAccessInclude;

type PortalAccessRow = Prisma.CasePortalAccessGetPayload<{ include: typeof portalAccessInclude }>;

export class CasePortalAccessRepository implements ICasePortalAccessRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createAccess(
    businessId: number,
    caseId: number,
    tokenHash: string,
    tokenEncrypted: string,
    expiresAt: Date,
    now: Date
  ): Promise<CreatePortalAccessResult> {
    return this.prisma.$transaction(async (tx) => {
      const accessibleCase = await tx.case.findFirst({
        where: { id: caseId, businessId },
        select: { id: true }
      });
      if (!accessibleCase) return { outcome: "case_not_found" };

      await tx.casePortalAccess.updateMany({
        where: { caseId, revokedAt: null },
        data: { revokedAt: now }
      });
      const access = await tx.casePortalAccess.create({
        data: { caseId, tokenHash, tokenEncrypted, expiresAt },
        select: { id: true, expiresAt: true }
      });
      return { outcome: "created", access };
    });
  }

  async findActiveAccessForCase(
    businessId: number,
    caseId: number,
    now: Date
  ): Promise<FindActivePortalAccessResult> {
    const accessibleCase = await this.prisma.case.findFirst({
      where: { id: caseId, businessId },
      select: { id: true }
    });
    if (!accessibleCase) return { outcome: "case_not_found" };

    const access = await this.prisma.casePortalAccess.findFirst({
      where: { caseId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, tokenHash: true, tokenEncrypted: true, expiresAt: true }
    });
    return { outcome: "found", access };
  }

  async resolveActiveAccess(tokenHash: string, now: Date): Promise<ResolvedPortalAccess | null> {
    const access = await this.prisma.casePortalAccess.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      include: portalAccessInclude
    });
    if (!access) return null;

    const touched = await this.prisma.casePortalAccess.updateMany({
      where: { id: access.id, tokenHash, revokedAt: null, expiresAt: { gt: now } },
      data: { lastAccessedAt: now }
    });
    return touched.count === 1 ? mapAccess(access) : null;
  }

  async revokeAccess(businessId: number, caseId: number, now: Date): Promise<RevokePortalAccessResult> {
    return this.prisma.$transaction(async (tx) => {
      const accessibleCase = await tx.case.findFirst({
        where: { id: caseId, businessId },
        select: { id: true }
      });
      if (!accessibleCase) return { outcome: "case_not_found" };

      const revoked = await tx.casePortalAccess.updateMany({
        where: { caseId, revokedAt: null },
        data: { revokedAt: now }
      });
      return { outcome: "revoked", revokedCount: revoked.count };
    });
  }
}

function mapAccess(access: PortalAccessRow): ResolvedPortalAccess {
  return {
    id: access.id,
    tokenHash: access.tokenHash,
    expiresAt: access.expiresAt,
    case: mapCase(access.case)
  };
}

function mapCase(caseRow: PortalAccessRow["case"]): PortalCaseRecord {
  return {
    id: caseRow.id,
    businessId: caseRow.businessId,
    name: caseRow.name,
    status: caseRow.status,
    clientDisplayName: caseRow.lead.client?.name?.trim()
      || caseRow.lead.name?.trim()
      || "Client",
    advisorDisplayName: caseRow.assignee?.displayName?.trim() || null,
    requirements: caseRow.documentSpecifications.map((specification) => ({
      id: specification.id,
      label: specification.label,
      required: specification.required,
      schemaName: specification.schema.name,
      documentTypeName: specification.schema.documentType.name,
      category: specification.schema.documentType.category,
      documents: specification.documents.map((document) => ({
        id: document.id,
        filename: document.filename,
        status: document.status,
        createdAt: document.createdAt,
        requirementAnswer: document.requirementAnswer
      }))
    }))
  };
}
