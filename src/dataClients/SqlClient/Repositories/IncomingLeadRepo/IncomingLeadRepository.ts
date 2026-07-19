import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import { CreateIncomingLeadInput, IncomingLeadDto, IncomingLeadStatus } from "../../../Types/leadIngestionTypes";
import { IIncomingLeadRepository } from "./IIncomingLeadRepository";

export class IncomingLeadRepository implements IIncomingLeadRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async create(input: CreateIncomingLeadInput): Promise<IncomingLeadDto> {
        const lead = await this.prisma.incomingLead.create({ data: { ...input, rawPayload: jsonOrNull(input.rawPayload), canonicalPayload: json(input.canonicalPayload) } });
        return mapIncomingLead(lead);
    }

    async getById(businessId: number, incomingLeadId: number): Promise<IncomingLeadDto | null> {
        const lead = await this.prisma.incomingLead.findFirst({ where: { id: incomingLeadId, businessId } });
        return lead ? mapIncomingLead(lead) : null;
    }

    async getByIdempotencyKey(integrationConnectionId: number, idempotencyKey: string): Promise<IncomingLeadDto | null> {
        const lead = await this.prisma.incomingLead.findUnique({ where: { integrationConnectionId_idempotencyKey: { integrationConnectionId, idempotencyKey } } });
        return lead ? mapIncomingLead(lead) : null;
    }

    async updateStatus(businessId: number, incomingLeadId: number, status: IncomingLeadStatus, failure?: { code: string; detail?: string }): Promise<IncomingLeadDto> {
        const updated = await this.prisma.incomingLead.updateMany({
            where: { id: incomingLeadId, businessId },
            data: { status, failureCode: failure?.code, failureDetail: failure?.detail, processedAt: status === "PROCESSED" ? new Date() : undefined }
        });
        if (updated.count !== 1) throw new Error(`Incoming lead ${incomingLeadId} not found for business ${businessId}`);
        return (await this.getById(businessId, incomingLeadId))!;
    }
}

function mapIncomingLead(lead: any): IncomingLeadDto {
    return { id: lead.id, businessId: lead.businessId, integrationConnectionId: lead.integrationConnectionId, provider: lead.provider, eventType: lead.eventType, providerEventId: lead.providerEventId, idempotencyKey: lead.idempotencyKey, payloadHash: lead.payloadHash, rawPayload: lead.rawPayload, canonicalPayload: lead.canonicalPayload, status: lead.status, failureCode: lead.failureCode, failureDetail: lead.failureDetail, receivedAt: lead.receivedAt.toISOString(), processedAt: lead.processedAt?.toISOString() || null, externalLeadId: lead.externalLeadId };
}
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function jsonOrNull(value: unknown): Prisma.InputJsonValue | undefined { return value === undefined || value === null ? undefined : json(value); }
