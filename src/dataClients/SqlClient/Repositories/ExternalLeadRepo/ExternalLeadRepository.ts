import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import { CreateExternalLeadInput, CreateLeadAttributionInput, ExternalLeadDto, LeadAttributionDto } from "../../../Types/leadIngestionTypes";
import { IExternalLeadRepository } from "./IExternalLeadRepository";

export class ExternalLeadRepository implements IExternalLeadRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async create(input: CreateExternalLeadInput): Promise<ExternalLeadDto> {
        const lead = await this.prisma.externalLead.create({ data: { ...input, externalLeadId: required(input.externalLeadId, "externalLeadId"), metadata: jsonOrNull(input.metadata) } });
        return mapExternalLead(lead);
    }

    async getByExternalId(integrationConnectionId: number, externalLeadId: string): Promise<ExternalLeadDto | null> {
        const lead = await this.prisma.externalLead.findUnique({ where: { integrationConnectionId_externalLeadId: { integrationConnectionId, externalLeadId } } });
        return lead ? mapExternalLead(lead) : null;
    }

    async createAttribution(businessId: number, input: CreateLeadAttributionInput): Promise<LeadAttributionDto> {
        const owner = await this.prisma.lead.findFirst({ where: { id: input.leadId, businessId }, select: { id: true } });
        if (!owner) throw new Error(`Lead ${input.leadId} not found for business ${businessId}`);
        const attribution = await this.prisma.leadAttribution.create({ data: { ...input, raw: jsonOrNull(input.raw) } });
        return { ...input, id: attribution.id, createdAt: attribution.createdAt.toISOString() };
    }
}

function mapExternalLead(lead: any): ExternalLeadDto {
    return { id: lead.id, businessId: lead.businessId, integrationConnectionId: lead.integrationConnectionId, leadId: lead.leadId, provider: lead.provider, externalLeadId: lead.externalLeadId, externalContactId: lead.externalContactId, metadata: lead.metadata, firstReceivedAt: lead.firstReceivedAt.toISOString(), lastReceivedAt: lead.lastReceivedAt.toISOString() };
}
function required(value: string, name: string): string { const normalized = value?.trim(); if (!normalized) throw new Error(`${name} is required`); return normalized; }
function jsonOrNull(value: unknown): Prisma.InputJsonValue | undefined { return value === undefined || value === null ? undefined : JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
