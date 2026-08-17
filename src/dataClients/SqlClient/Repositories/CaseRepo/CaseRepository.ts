import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import {
  CaseAssigneeDto,
  CaseCommentDto,
  CaseClientDto,
  CaseDetailsDto,
  CaseDocumentDto,
  CaseDocumentSpecificationDto,
  CaseListItemDto,
  CreateCaseCommentRequestDto,
  CreateCaseRequestDto,
  SchemaDto
} from "../../../../contracts";
import { CreateCaseResult, ICaseRepository } from "./ICaseRepository";

const caseDetailsInclude = {
  lead: { include: { client: true } },
  assignee: true,
  documentSpecifications: {
    include: {
      schema: { include: { documentType: true } },
      documents: { select: { id: true } }
    },
    orderBy: { id: "asc" }
  },
  documents: {
    include: {
      documentType: true,
      schema: true,
      uploadedBy: true,
    },
    orderBy: { createdAt: "asc" }
  }
} satisfies Prisma.CaseInclude;

const caseListInclude = {
  lead: { include: { client: true } },
  assignee: true,
  _count: { select: { documentSpecifications: true, documents: true } }
} satisfies Prisma.CaseInclude;

type CaseDetailsRow = Prisma.CaseGetPayload<{ include: typeof caseDetailsInclude }>;
type CaseListRow = Prisma.CaseGetPayload<{ include: typeof caseListInclude }>;
const caseCommentInclude = {
  author: { select: { id: true, displayName: true, email: true } }
} satisfies Prisma.CaseCommentInclude;

type CaseCommentRow = Prisma.CaseCommentGetPayload<{ include: typeof caseCommentInclude }>;

export class CaseRepository implements ICaseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createCase(businessId: number, request: CreateCaseRequestDto): Promise<CreateCaseResult> {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: request.leadId, businessId },
        select: { id: true }
      });
      if (!lead) return { outcome: "lead_not_found" };

      if (request.assigneeId != null) {
        const membership = await tx.businessUser.findFirst({
          where: { businessId, userId: request.assigneeId },
          select: { id: true }
        });
        if (!membership) return { outcome: "assignee_not_found" };
      }

      const requestedSchemaIds = [...new Set(
        request.documentSpecifications.map((specification) => specification.schemaId)
      )];
      const accessibleSchemas = requestedSchemaIds.length === 0
        ? []
        : await tx.schema.findMany({
            where: {
              id: { in: requestedSchemaIds },
              OR: [
                { businessId, isCustom: true },
                { businessId: null, isCustom: false }
              ]
            },
            select: { id: true }
          });
      const accessibleSchemaIds = new Set(accessibleSchemas.map((schema) => schema.id));
      const missingSchemaIds = requestedSchemaIds.filter((schemaId) => !accessibleSchemaIds.has(schemaId));
      if (missingSchemaIds.length > 0) {
        return { outcome: "schemas_not_found", schemaIds: missingSchemaIds };
      }

      const createdCase = await tx.case.create({
        data: {
          businessId,
          leadId: request.leadId,
          assigneeId: request.assigneeId ?? null,
          name: request.name.trim()
        },
        select: { id: true }
      });

      if (request.documentSpecifications.length > 0) {
        await tx.caseDocumentSpecification.createMany({
          data: request.documentSpecifications.map((specification) => ({
            caseId: createdCase.id,
            schemaId: specification.schemaId,
            label: specification.label?.trim() || null,
            required: specification.required
          }))
        });
      }

      const details = await tx.case.findFirst({
        where: { id: createdCase.id, businessId },
        include: caseDetailsInclude
      });
      if (!details) throw new Error("Created Case could not be reloaded");
      return { outcome: "created", case: mapCaseDetails(details) };
    });
  }

  async listCases(businessId: number): Promise<CaseListItemDto[]> {
    const cases = await this.prisma.case.findMany({
      where: { businessId },
      include: caseListInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });
    return cases.map(mapCaseListItem);
  }

  async getCaseDetails(businessId: number, caseId: number): Promise<CaseDetailsDto | null> {
    const caseRow = await this.prisma.case.findFirst({
      where: { id: caseId, businessId },
      include: caseDetailsInclude
    });
    return caseRow ? mapCaseDetails(caseRow) : null;
  }

  async createComment(
    businessId: number,
    caseId: number,
    authorUserId: number,
    request: CreateCaseCommentRequestDto
  ): Promise<CaseCommentDto | null> {
    const accessibleCase = await this.prisma.case.findFirst({
      where: { id: caseId, businessId },
      select: { id: true }
    });
    if (!accessibleCase) return null;

    const comment = await this.prisma.caseComment.create({
      data: { caseId, authorUserId, content: request.content.trim() },
      include: caseCommentInclude
    });
    return mapCaseComment(comment);
  }

  async getComments(businessId: number, caseId: number): Promise<CaseCommentDto[] | null> {
    const accessibleCase = await this.prisma.case.findFirst({
      where: { id: caseId, businessId },
      select: { id: true }
    });
    if (!accessibleCase) return null;

    const comments = await this.prisma.caseComment.findMany({
      where: { caseId },
      include: caseCommentInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    return comments.map(mapCaseComment);
  }
}

function mapCaseComment(comment: CaseCommentRow): CaseCommentDto {
  return {
    id: comment.id,
    caseId: comment.caseId,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    author: comment.author
  };
}

function mapCaseListItem(caseRow: CaseListRow): CaseListItemDto {
  return {
    id: caseRow.id,
    name: caseRow.name,
    client: mapClient(caseRow.lead),
    status: caseRow.status,
    assignee: mapAssignee(caseRow.assignee),
    expectedDocuments: caseRow._count.documentSpecifications,
    uploadedDocuments: caseRow._count.documents,
    createdAt: caseRow.createdAt.toISOString(),
    updatedAt: caseRow.updatedAt.toISOString(),
    completedAt: isoOrNull(caseRow.completedAt),
    archivedAt: isoOrNull(caseRow.archivedAt)
  };
}

function mapCaseDetails(caseRow: CaseDetailsRow): CaseDetailsDto {
  return {
    id: caseRow.id,
    name: caseRow.name,
    client: mapClient(caseRow.lead),
    status: caseRow.status,
    assignee: mapAssignee(caseRow.assignee),
    createdAt: caseRow.createdAt.toISOString(),
    updatedAt: caseRow.updatedAt.toISOString(),
    completedAt: isoOrNull(caseRow.completedAt),
    archivedAt: isoOrNull(caseRow.archivedAt),
    documentSpecifications: caseRow.documentSpecifications.map(mapSpecification),
    documents: caseRow.documents.map(mapDocument)
  };
}

function mapClient(lead: CaseDetailsRow["lead"]): CaseClientDto {
  return {
    id: lead.client?.id ?? lead.id,
    displayName: lead.client?.name ?? lead.name ?? lead.phoneNumber ?? `Lead ${lead.id}`
  };
}

function mapAssignee(assignee: CaseDetailsRow["assignee"]): CaseAssigneeDto | null {
  if (!assignee) return null;
  return {
    id: assignee.id,
    displayName: assignee.displayName ?? assignee.email
  };
}

function mapSpecification(
  specification: CaseDetailsRow["documentSpecifications"][number]
): CaseDocumentSpecificationDto {
  return {
    id: specification.id,
    required: specification.required,
    label: specification.label,
    schema: mapSchema(specification.schema),
    documentIds: specification.documents.map((document) => document.id),
    createdAt: specification.createdAt.toISOString(),
    updatedAt: specification.updatedAt.toISOString()
  };
}

function mapSchema(
  schema: CaseDetailsRow["documentSpecifications"][number]["schema"]
): SchemaDto {
  return {
    id: schema.id,
    businessId: schema.businessId,
    isCustom: schema.isCustom,
    documentType: {
      id: schema.documentType.id,
      name: schema.documentType.name,
      category: schema.documentType.category
    },
    name: schema.name,
    version: schema.version,
    requirementSchema: schema.requirementSchema
  };
}

function mapDocument(document: CaseDetailsRow["documents"][number]): CaseDocumentDto {
  return {
    id: document.id,
    caseDocumentSpecificationId: document.caseDocumentSpecificationId,
    filename: document.filename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    status: document.status,
    source: document.source,
    documentType: document.documentType ? {
      id: document.documentType.id,
      name: document.documentType.name,
      category: document.documentType.category
    } : null,
    schema: document.schema ? {
      id: document.schema.id,
      name: document.schema.name,
      version: document.schema.version
    } : null,
    requirementAnswer: document.requirementAnswer,
    uploadedAt: document.createdAt.toISOString(),
    uploadedBy: document.uploadedBy ? {
      id: document.uploadedBy.id,
      displayName: document.uploadedBy.displayName ?? document.uploadedBy.email
    } : null
  };
}

function isoOrNull(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
