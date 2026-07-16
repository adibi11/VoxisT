import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import {
    CreateManualLeadRequestDto,
    LeadDto,
    LeadSourceDto,
    LeadStatusDto,
    LeadSummaryDto,
    UpdateLeadRequestDto
} from "../../../../contracts";
import { ILeadRepository, LeadAssignmentResult } from "./ILeadRepository";

export class LeadRepository implements ILeadRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async getLeadsByBusiness(businessId: number): Promise<LeadSummaryDto[]> {
        const leads = await this.prisma.lead.findMany({
            where: {
                businessId
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        return leads.map(mapPrismaLeadToSummary);
    }

    async getLeadById(businessId: number, leadId: number): Promise<LeadDto | null> {
        const lead = await this.prisma.lead.findFirst({
            where: {
                id: leadId,
                businessId
            }
        });

        return lead ? mapPrismaLeadToDto(lead) : null;
    }

    async createManualLead(businessId: number, leadDto: CreateManualLeadRequestDto): Promise<LeadDto> {
        const normalizedName = normalizeOptionalString(leadDto.name);
        const normalizedEmail = normalizeOptionalEmail(leadDto.email);
        const normalizedPhoneNumber = normalizeOptionalString(leadDto.phoneNumber);
        if (!leadDto.clientId && !normalizedPhoneNumber) {
            throw new Error("Manual lead requires clientId or phoneNumber");
        }

        const client = await this.resolveLeadClient(leadDto.clientId, normalizedPhoneNumber, normalizedName);
        const lead = await this.prisma.lead.create({
            data: {
                businessId,
                clientId: client.id,
                memberId: leadDto.memberId,
                status: (leadDto.status || "NEW") as any,
                source: (leadDto.source || "MANUAL") as any,
                score: leadDto.score,
                summary: normalizeOptionalString(leadDto.summary),
                notes: normalizeOptionalString(leadDto.notes),
                name: normalizedName || client?.name || undefined,
                email: normalizedEmail,
                phoneNumber: normalizedPhoneNumber || client?.phoneNumber || undefined,
                followUpAt: parseOptionalDate(leadDto.followUpAt),
                asignTime: leadDto.memberId ? new Date() : undefined
            }
        });

        return mapPrismaLeadToDto(lead);
    }

    async updateLead(businessId: number, leadId: number, leadDto: UpdateLeadRequestDto): Promise<LeadDto> {
        const existingLead = await this.prisma.lead.findFirst({
            where: {
                id: leadId,
                businessId
            }
        });

        if (!existingLead) {
            throw new Error(`Lead ${leadId} not found for business ${businessId}`);
        }

        const status = leadDto.status;
        const data: Prisma.LeadUncheckedUpdateInput = {
            status: status === undefined ? undefined : status as any,
            score: leadDto.score === undefined ? undefined : leadDto.score,
            summary: leadDto.summary === undefined ? undefined : normalizeNullableString(leadDto.summary),
            notes: leadDto.notes === undefined ? undefined : normalizeNullableString(leadDto.notes),
            name: leadDto.name === undefined ? undefined : normalizeNullableString(leadDto.name),
            email: leadDto.email === undefined ? undefined : normalizeNullableEmail(leadDto.email),
            phoneNumber: leadDto.phoneNumber === undefined ? undefined : normalizeNullableString(leadDto.phoneNumber),
            followUpAt: leadDto.followUpAt === undefined ? undefined : parseOptionalDate(leadDto.followUpAt),
            closedAt: status && isClosedLeadStatus(status) ? new Date() : undefined
        };

        const lead = await this.prisma.lead.update({
            where: {
                id: existingLead.id
            },
            data
        });

        return mapPrismaLeadToDto(lead);
    }

    async compareAndSetAssignee(
        businessId: number,
        leadId: number,
        expectedMemberId: number | null,
        memberId: number | null
    ): Promise<LeadAssignmentResult> {
        const updated = await this.prisma.lead.updateMany({
            where: { id: leadId, businessId, memberId: expectedMemberId },
            data: { memberId, asignTime: memberId === null ? null : new Date() }
        });

        const lead = await this.prisma.lead.findFirst({ where: { id: leadId, businessId } });
        if (!lead) return { outcome: "not_found" };
        if (updated.count !== 1) return { outcome: "conflict", lead: mapPrismaLeadToDto(lead) };
        return { outcome: "updated", lead: mapPrismaLeadToDto(lead) };
    }

    async deleteLead(businessId: number, leadId: number): Promise<void> {
        const result = await this.prisma.lead.deleteMany({
            where: {
                id: leadId,
                businessId
            }
        });

        if (result.count === 0) {
            throw new Error(`Lead ${leadId} not found for business ${businessId}`);
        }
    }

    private async resolveLeadClient(clientId?: number, phoneNumber?: string, name?: string): Promise<{ id: number; name: string | null; phoneNumber: string }> {
        if (clientId) {
            const client = await this.prisma.client.findUnique({
                where: {
                    id: clientId
                }
            });

            if (!client) {
                throw new Error(`Client ${clientId} not found`);
            }

            if (name && client.name !== name) {
                return this.prisma.client.update({
                    where: {
                        id: client.id
                    },
                    data: {
                        name
                    }
                });
            }

            return client;
        }

        if (!phoneNumber) {
            throw new Error("Manual lead requires clientId or phoneNumber");
        }

        const existingClient = await this.prisma.client.findUnique({
            where: {
                phoneNumber
            }
        });

        if (existingClient) {
            if (name && existingClient.name !== name) {
                return this.prisma.client.update({
                    where: {
                        id: existingClient.id
                    },
                    data: {
                        name
                    }
                });
            }

            return existingClient;
        }

        return this.prisma.client.create({
            data: {
                phoneNumber,
                name
            }
        });
    }
}

type PrismaLeadForDto = {
    id: number;
    businessId: number;
    clientId: number | null;
    memberId: number | null;
    status: string;
    source: string;
    score: number | null;
    summary: string | null;
    notes: string | null;
    name: string | null;
    email: string | null;
    phoneNumber: string | null;
    createdAt: Date;
    updatedAt: Date;
    asignTime: Date | null;
    followUpAt: Date | null;
    closedAt: Date | null;
};

function mapPrismaLeadToSummary(lead: PrismaLeadForDto): LeadSummaryDto {
    return {
        id: lead.id,
        businessId: lead.businessId,
        clientId: lead.clientId,
        memberId: lead.memberId,
        status: lead.status as LeadStatusDto,
        source: lead.source as LeadSourceDto,
        score: lead.score,
        summary: lead.summary,
        name: lead.name,
        email: lead.email,
        phoneNumber: lead.phoneNumber,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
        assignedAt: lead.asignTime?.toISOString() || null,
        followUpAt: lead.followUpAt?.toISOString() || null,
        closedAt: lead.closedAt?.toISOString() || null
    };
}

function mapPrismaLeadToDto(lead: PrismaLeadForDto): LeadDto {
    return {
        ...mapPrismaLeadToSummary(lead),
        notes: lead.notes
    };
}

function normalizeOptionalString(value?: string | null): string | undefined {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : undefined;
}

function normalizeOptionalEmail(value?: string | null): string | undefined {
    const normalizedValue = value?.trim().toLowerCase();
    return normalizedValue || undefined;
}

function normalizeNullableString(value?: string | null): string | null {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : null;
}

function normalizeNullableEmail(value?: string | null): string | null {
    const normalizedValue = value?.trim().toLowerCase();
    return normalizedValue || null;
}

function parseOptionalDate(value?: string | null): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value.trim() === "") return null;

    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        throw new Error(`Invalid date: ${value}`);
    }

    return date;
}

function isClosedLeadStatus(status: LeadStatusDto): boolean {
    return status === "WON" || status === "LOST" || status === "CLOSED";
}
