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
      },
      followUps: {
        where: { status: "ACCEPTED", acceptedAt: { not: null } },
        select: { acceptedAt: true },
        orderBy: { acceptedAt: "asc" },
        take: 1
      },
      voiceInteractions: {
        where: { status: { in: ["SUBMITTING", "UNKNOWN"] } },
        select: { id: true },
        take: 1
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

  async recoverAbandoned(now: Date, limit: number) {
    const ambiguous = await this.prisma.caseFollowUp.findMany({
      where: {
        status: "PROCESSING",
        leaseExpiresAt: { lt: now },
        dispatchStartedAt: { not: null }
      },
      select: { id: true, businessId: true },
      orderBy: [{ leaseExpiresAt: "asc" }, { id: "asc" }],
      take: limit
    });
    for (const candidate of ambiguous) {
      await this.prisma.$transaction(async (tx) => {
        const failed = await tx.caseFollowUp.updateMany({
          where: {
            id: candidate.id,
            status: "PROCESSING",
            leaseExpiresAt: { lt: now },
            dispatchStartedAt: { not: null }
          },
          data: {
            status: "FAILED",
            processingLeaseId: null,
            leaseExpiresAt: null,
            failureCode: "PROVIDER_RESULT_UNKNOWN",
            failureReason: "Worker lease expired after provider dispatch began; automatic retry is unsafe"
          }
        });
        if (failed.count === 1) {
          await tx.voiceInteraction.updateMany({
            where: { caseFollowUpId: candidate.id, businessId: candidate.businessId, status: "SUBMITTING" },
            data: { status: "UNKNOWN", failureCode: "PROVIDER_RESULT_UNKNOWN" }
          });
        }
      });
    }
    const candidates = await this.prisma.caseFollowUp.findMany({
      where: {
        status: "PROCESSING",
        leaseExpiresAt: { lt: now },
        dispatchStartedAt: null
      },
      select: { id: true, businessId: true, attemptCount: true },
      orderBy: [{ leaseExpiresAt: "asc" }, { id: "asc" }],
      take: limit
    });
    const recovered: Array<{ id: number; attemptCount: number }> = [];
    for (const candidate of candidates) {
      const wasRecovered = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.caseFollowUp.updateMany({
          where: {
            id: candidate.id,
            status: "PROCESSING",
            leaseExpiresAt: { lt: now },
            dispatchStartedAt: null
          },
          data: {
            status: "PENDING",
            processingLeaseId: null,
            leaseExpiresAt: null,
            dispatchChannel: null,
            dispatchProvider: null,
            failureCode: null,
            failureReason: null
          }
        });
        if (updated.count !== 1) return false;
        await tx.voiceInteraction.updateMany({
          where: { caseFollowUpId: candidate.id, businessId: candidate.businessId, status: "SUBMITTING" },
          data: { status: "PENDING", failureCode: null }
        });
        return true;
      });
      if (wasRecovered) recovered.push(candidate);
    }
    return recovered;
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

  async claimPending(id: number, leaseId: string, leaseExpiresAt: Date): Promise<CaseFollowUpWorkItem | null> {
    const claimed = await this.prisma.caseFollowUp.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        processingLeaseId: leaseId,
        leaseExpiresAt,
        dispatchStartedAt: null
      }
    });
    if (claimed.count !== 1) return null;

    const followUp = await this.prisma.caseFollowUp.findUnique({
      where: { id },
      include: workItemInclude
    });
    if (!followUp || followUp.status !== "PROCESSING") return null;
    return mapWorkItem(followUp);
  }

  async reloadClaimed(id: number, leaseId: string, now: Date): Promise<CaseFollowUpWorkItem | null> {
    const followUp = await this.prisma.caseFollowUp.findFirst({
      where: {
        id,
        status: "PROCESSING",
        processingLeaseId: leaseId,
        leaseExpiresAt: { gt: now },
        dispatchStartedAt: null
      },
      include: workItemInclude
    });
    return followUp ? mapWorkItem(followUp) : null;
  }

  async markDispatchStarted(id: number, leaseId: string, startedAt: Date): Promise<boolean> {
    const updated = await this.prisma.caseFollowUp.updateMany({
      where: {
        id,
        status: "PROCESSING",
        processingLeaseId: leaseId,
        leaseExpiresAt: { gt: startedAt },
        dispatchStartedAt: null
      },
      data: { dispatchStartedAt: startedAt }
    });
    return updated.count === 1;
  }

  async selectDispatchPath(
    id: number,
    leaseId: string,
    channel: "sms" | "voice",
    provider: string
  ): Promise<boolean> {
    const updated = await this.prisma.caseFollowUp.updateMany({
      where: {
        id,
        status: "PROCESSING",
        processingLeaseId: leaseId,
        dispatchChannel: null,
        dispatchStartedAt: null
      },
      data: { dispatchChannel: channel, dispatchProvider: provider }
    });
    return updated.count === 1;
  }

  async markAccepted(id: number, leaseId: string, providerMessageId: string, acceptedAt: Date): Promise<boolean> {
    const updated = await this.prisma.caseFollowUp.updateMany({
      where: { id, status: "PROCESSING", processingLeaseId: leaseId },
      data: {
        status: "ACCEPTED",
        providerMessageId,
        acceptedAt,
        processingLeaseId: null,
        leaseExpiresAt: null,
        failureCode: null,
        failureReason: null
      }
    });
    return updated.count === 1;
  }

  async markFailed(id: number, leaseId: string, failureCode: string, failureReason: string): Promise<boolean> {
    const updated = await this.prisma.caseFollowUp.updateMany({
      where: { id, status: "PROCESSING", processingLeaseId: leaseId },
      data: {
        status: "FAILED",
        processingLeaseId: null,
        leaseExpiresAt: null,
        failureCode,
        failureReason
      }
    });
    return updated.count === 1;
  }

  async defer(id: number, leaseId: string, scheduledFor: Date): Promise<boolean> {
    const updated = await this.prisma.caseFollowUp.updateMany({
      where: { id, status: "PROCESSING", processingLeaseId: leaseId },
      data: {
        status: "PENDING",
        scheduledFor,
        attemptCount: { decrement: 1 },
        processingLeaseId: null,
        leaseExpiresAt: null,
        dispatchStartedAt: null,
        failureCode: null,
        failureReason: null
      }
    });
    return updated.count === 1;
  }

  async markSkipped(id: number, leaseId: string, reasonCode: string, reason: string): Promise<boolean> {
    const updated = await this.prisma.caseFollowUp.updateMany({
      where: { id, status: "PROCESSING", processingLeaseId: leaseId },
      data: {
        status: "SKIPPED",
        processingLeaseId: null,
        leaseExpiresAt: null,
        failureCode: reasonCode,
        failureReason: reason
      }
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
      lastBorrowerInteractionAt: followUp.case.lastBorrowerInteractionAt,
      firstSuccessfulFollowUpAt: followUp.case.followUps[0]?.acceptedAt ?? null,
      voiceSubmissionUnresolved: followUp.case.voiceInteractions.length > 0,
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
