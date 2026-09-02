import { PrismaClient } from "../../generated/prisma/client";
import { VoiceInteractionCorrelation } from "../Domain/VoiceCall";

export type CreateVoiceInteractionInput = {
  businessId: number;
  caseId: number;
  caseFollowUpId: number;
  provider: string;
  idempotencyKey: string;
  outboundNumberId: string;
  agentId: string;
};

export class VoiceInteractionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreate(input: CreateVoiceInteractionInput) {
    const followUp = await this.prisma.caseFollowUp.findFirst({
      where: {
        id: input.caseFollowUpId,
        businessId: input.businessId,
        caseId: input.caseId,
        case: { businessId: input.businessId }
      },
      select: { id: true }
    });
    if (!followUp) return null;

    return this.prisma.voiceInteraction.upsert({
      where: { caseFollowUpId: input.caseFollowUpId },
      create: input,
      update: {},
      select: {
        id: true,
        businessId: true,
        caseId: true,
        caseFollowUpId: true,
        provider: true,
        providerInteractionId: true,
        idempotencyKey: true,
        status: true
      }
    });
  }

  async markSubmitting(id: number, businessId: number): Promise<boolean> {
    const updated = await this.prisma.voiceInteraction.updateMany({
      where: { id, businessId, status: "PENDING" },
      data: { status: "SUBMITTING", failureCode: null }
    });
    return updated.count === 1;
  }

  async markAccepted(input: {
    id: number;
    businessId: number;
    providerInteractionId: string;
    providerStatus: string;
  }): Promise<boolean> {
    const updated = await this.prisma.voiceInteraction.updateMany({
      where: { id: input.id, businessId: input.businessId, status: "SUBMITTING" },
      data: {
        status: "ACCEPTED",
        providerInteractionId: input.providerInteractionId,
        providerStatus: input.providerStatus,
        failureCode: null
      }
    });
    return updated.count === 1;
  }

  async markAcceptedWithFollowUp(input: {
    id: number;
    businessId: number;
    caseFollowUpId: number;
    leaseId: string;
    providerInteractionId: string;
    providerStatus: string;
    acceptedAt: Date;
  }): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const interaction = await tx.voiceInteraction.updateMany({
          where: {
            id: input.id,
            businessId: input.businessId,
            caseFollowUpId: input.caseFollowUpId,
            status: "SUBMITTING"
          },
          data: {
            status: "ACCEPTED",
            providerInteractionId: input.providerInteractionId,
            providerStatus: input.providerStatus,
            failureCode: null
          }
        });
        const followUp = await tx.caseFollowUp.updateMany({
          where: {
            id: input.caseFollowUpId,
            businessId: input.businessId,
            status: "PROCESSING",
            processingLeaseId: input.leaseId,
            dispatchStartedAt: { not: null }
          },
          data: {
            status: "ACCEPTED",
            providerMessageId: input.providerInteractionId,
            acceptedAt: input.acceptedAt,
            processingLeaseId: null,
            leaseExpiresAt: null,
            failureCode: null,
            failureReason: null
          }
        });
        if (interaction.count !== 1 || followUp.count !== 1) throw new VoiceAcceptanceConflict();
      });
      return true;
    } catch (error) {
      if (error instanceof VoiceAcceptanceConflict) return false;
      throw error;
    }
  }

  async markFailed(id: number, businessId: number, failureCode: string): Promise<boolean> {
    const updated = await this.prisma.voiceInteraction.updateMany({
      where: { id, businessId, status: { in: ["PENDING", "SUBMITTING"] } },
      data: { status: "FAILED", failureCode }
    });
    return updated.count === 1;
  }

  async markUnknown(id: number, businessId: number, failureCode: string): Promise<boolean> {
    const updated = await this.prisma.voiceInteraction.updateMany({
      where: { id, businessId, status: "SUBMITTING" },
      data: { status: "UNKNOWN", failureCode }
    });
    return updated.count === 1;
  }

  // This lookup is for authenticated provider events. The returned businessId,
  // not event-supplied tenant data, is the authority for all subsequent access.
  async resolveProviderCorrelation(
    provider: string,
    providerInteractionId: string
  ): Promise<VoiceInteractionCorrelation | null> {
    const interaction = await this.prisma.voiceInteraction.findUnique({
      where: { provider_providerInteractionId: { provider, providerInteractionId } },
      select: { id: true, businessId: true, caseId: true, caseFollowUpId: true }
    });
    return interaction ? {
      voiceInteractionId: interaction.id,
      businessId: interaction.businessId,
      caseId: interaction.caseId,
      caseFollowUpId: interaction.caseFollowUpId
    } : null;
  }
}

class VoiceAcceptanceConflict extends Error {}
