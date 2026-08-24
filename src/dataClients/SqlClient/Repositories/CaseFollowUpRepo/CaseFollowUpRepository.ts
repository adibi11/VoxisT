import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import { CaseFollowUpRequirementRecord } from "../../../../CaseFollowUp/caseFollowUpTypes";
import {
  CaseFollowUpCandidate,
  CaseFollowUpWorkItem,
  CreatePendingCaseFollowUpResult,
  ICaseFollowUpRepository
} from "./ICaseFollowUpRepository";

const requirementInclude = {
  schema: { include: { documentType: true } },
  documents: {
    select: { status: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  }
} satisfies Prisma.CaseDocumentSpecificationInclude;

const workItemInclude = {
  case: {
    include: {
      business: {
        select: {
          businessName: true,
          followUpPolicy: {
            select: {
              caseDocumentFollowUpEnabled: true,
              caseDocumentFollowUpHour: true,
              timezone: true
            }
          }
        }
      },
      lead: { include: { client: true } },
      documentSpecifications: {
        include: requirementInclude,
        orderBy: { id: "asc" }
      }
    }
  }
} satisfies Prisma.CaseFollowUpInclude;

type RequirementRow = Prisma.CaseDocumentSpecificationGetPayload<{ include: typeof requirementInclude }>;
type WorkItemRow = Prisma.CaseFollowUpGetPayload<{ include: typeof workItemInclude }>;

export class CaseFollowUpRepository implements ICaseFollowUpRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listPendingIdsForEnqueue(now: Date, limit: number): Promise<number[]> {
    const followUps = await this.prisma.caseFollowUp.findMany({
      where: { status: "PENDING", scheduledFor: { lte: now } },
      select: { id: true },
      orderBy: [{ scheduledFor: "asc" }, { id: "asc" }],
      take: limit
    });
    return followUps.map((followUp) => followUp.id);
  }

  async listSchedulerCandidates(
    afterCaseId: number | null,
    limit: number
  ): Promise<CaseFollowUpCandidate[]> {
    const cases = await this.prisma.case.findMany({
      where: {
        id: afterCaseId === null ? undefined : { gt: afterCaseId },
        status: { in: ["IN_PROGRESS", "IN_REVIEW", "NEEDS_ATTENTION"] },
        archivedAt: null,
        business: {
          followUpPolicy: {
            is: {
              caseDocumentFollowUpEnabled: true,
              caseDocumentFollowUpHour: { not: null }
            }
          },
          channels: {
            some: {
              channel: "sms",
              provider: "twilio",
              status: "active",
              externalPhoneNumberId: { not: null }
            }
          }
        },
        lead: {
          OR: [
            { clientId: { not: null } },
            { phoneNumber: { not: null } }
          ]
        }
      },
      include: {
        business: {
          select: {
            followUpPolicy: {
              select: {
                caseDocumentFollowUpEnabled: true,
                caseDocumentFollowUpHour: true,
                timezone: true
              }
            }
          }
        },
        lead: { include: { client: true } },
        documentSpecifications: {
          include: requirementInclude,
          orderBy: { id: "asc" }
        }
      },
      orderBy: { id: "asc" },
      take: limit
    });

    return cases.map((caseRow) => ({
      caseId: caseRow.id,
      businessId: caseRow.businessId,
      status: caseRow.status,
      archivedAt: caseRow.archivedAt,
      clientPhoneNumber: caseRow.lead.client?.phoneNumber ?? null,
      leadPhoneNumber: caseRow.lead.phoneNumber,
      smsConfigured: true,
      policy: {
        enabled: caseRow.business.followUpPolicy?.caseDocumentFollowUpEnabled ?? false,
        timezone: caseRow.business.followUpPolicy?.timezone ?? "UTC",
        hour: caseRow.business.followUpPolicy?.caseDocumentFollowUpHour ?? null
      },
      requirements: caseRow.documentSpecifications.map(mapRequirement)
    }));
  }

  async createPending(
    businessId: number,
    caseId: number,
    cadenceKey: string,
    scheduledFor: Date
  ): Promise<CreatePendingCaseFollowUpResult> {
    try {
      const followUp = await this.prisma.caseFollowUp.create({
        data: { businessId, caseId, cadenceKey, scheduledFor },
        select: { id: true }
      });
      return { outcome: "created", id: followUp.id };
    } catch (error) {
      if (isUniqueConstraintError(error)) return { outcome: "duplicate" };
      throw error;
    }
  }

  async claimPending(id: number): Promise<CaseFollowUpWorkItem | null> {
    const claimed = await this.prisma.caseFollowUp.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "PROCESSING", attemptCount: { increment: 1 } }
    });
    if (claimed.count !== 1) return null;

    const followUp = await this.prisma.caseFollowUp.findUnique({
      where: { id },
      include: workItemInclude
    });
    if (!followUp || followUp.status !== "PROCESSING") return null;
    return mapWorkItem(followUp);
  }

  async markAccepted(id: number, providerMessageId: string, acceptedAt: Date): Promise<boolean> {
    const updated = await this.prisma.caseFollowUp.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        status: "ACCEPTED",
        providerMessageId,
        acceptedAt,
        failureCode: null,
        failureReason: null
      }
    });
    return updated.count === 1;
  }

  async markFailed(id: number, failureCode: string, failureReason: string): Promise<boolean> {
    const updated = await this.prisma.caseFollowUp.updateMany({
      where: { id, status: "PROCESSING" },
      data: { status: "FAILED", failureCode, failureReason }
    });
    return updated.count === 1;
  }

  async defer(id: number, scheduledFor: Date): Promise<boolean> {
    const updated = await this.prisma.caseFollowUp.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        status: "PENDING",
        scheduledFor,
        attemptCount: { decrement: 1 },
        failureCode: null,
        failureReason: null
      }
    });
    return updated.count === 1;
  }

  async markSkipped(id: number, reasonCode: string, reason: string): Promise<boolean> {
    const updated = await this.prisma.caseFollowUp.updateMany({
      where: { id, status: "PROCESSING" },
      data: { status: "SKIPPED", failureCode: reasonCode, failureReason: reason }
    });
    return updated.count === 1;
  }
}

function mapRequirement(specification: RequirementRow): CaseFollowUpRequirementRecord {
  return {
    id: specification.id,
    label: specification.label,
    required: specification.required,
    schemaName: specification.schema.name,
    documentTypeName: specification.schema.documentType.name,
    documents: specification.documents.map((document) => ({
      status: document.status,
      createdAt: document.createdAt
    }))
  };
}

function mapWorkItem(followUp: WorkItemRow): CaseFollowUpWorkItem {
  const lead = followUp.case.lead;
  return {
    id: followUp.id,
    businessId: followUp.businessId,
    caseId: followUp.caseId,
    status: "PROCESSING",
    cadenceKey: followUp.cadenceKey,
    case: {
      businessId: followUp.case.businessId,
      status: followUp.case.status,
      archivedAt: followUp.case.archivedAt,
      businessName: followUp.case.business.businessName,
      clientId: lead.clientId,
      clientName: lead.client?.name?.trim() || lead.name?.trim() || "לקוח/ה",
      clientPhoneNumber: lead.client?.phoneNumber ?? null,
      leadPhoneNumber: lead.phoneNumber,
      policy: followUp.case.business.followUpPolicy ? {
        enabled: followUp.case.business.followUpPolicy.caseDocumentFollowUpEnabled,
        timezone: followUp.case.business.followUpPolicy.timezone,
        hour: followUp.case.business.followUpPolicy.caseDocumentFollowUpHour
      } : null,
      requirements: followUp.case.documentSpecifications.map(mapRequirement)
    }
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "P2002";
}
