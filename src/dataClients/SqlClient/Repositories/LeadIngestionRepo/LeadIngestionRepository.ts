import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import { IncomingLeadDto } from "../../../Types/leadIngestionTypes";
import { ILeadIngestionRepository, PersistLeadIngestionInput, PersistLeadIngestionResult } from "./ILeadIngestionRepository";

const LEAD_INGESTION_REQUESTED = "lead.ingestion.requested";

export class LeadIngestionRepository implements ILeadIngestionRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async persistReceivedLead(input: PersistLeadIngestionInput): Promise<PersistLeadIngestionResult> {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const incomingLead = await tx.incomingLead.create({
                    data: {
                        ...input,
                        providerEventId: optionalString(input.providerEventId),
                        rawPayload: jsonOrUndefined(input.rawPayload),
                        canonicalPayload: json(input.canonicalPayload)
                    }
                });
                await tx.ingestionOutbox.create({
                    data: {
                        businessId: input.businessId,
                        aggregateType: "incoming_lead",
                        aggregateId: incomingLead.id,
                        eventType: LEAD_INGESTION_REQUESTED,
                        payload: { incomingLeadId: incomingLead.id }
                    }
                });
                return { outcome: "accepted" as const, incomingLead: mapIncomingLead(incomingLead) };
            });
        } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
            const existing = await this.prisma.incomingLead.findUnique({
                where: { integrationConnectionId_idempotencyKey: { integrationConnectionId: input.integrationConnectionId, idempotencyKey: input.idempotencyKey } }
            });
            if (!existing) throw error;
            return { outcome: "duplicate", incomingLead: mapIncomingLead(existing) };
        }
    }
}

function mapIncomingLead(lead: any): IncomingLeadDto {
    return {
        id: lead.id, businessId: lead.businessId, integrationConnectionId: lead.integrationConnectionId,
        provider: lead.provider, eventType: lead.eventType, providerEventId: lead.providerEventId,
        idempotencyKey: lead.idempotencyKey, payloadHash: lead.payloadHash, rawPayload: lead.rawPayload,
        canonicalPayload: lead.canonicalPayload, status: lead.status, failureCode: lead.failureCode,
        failureDetail: lead.failureDetail, receivedAt: lead.receivedAt.toISOString(),
        processedAt: lead.processedAt?.toISOString() || null, externalLeadId: lead.externalLeadId
    };
}

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function jsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined { return value === undefined || value === null ? undefined : json(value); }
function optionalString(value?: string): string | null { const normalized = value?.trim(); return normalized || null; }
