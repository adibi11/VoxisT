import { FollowUpStatus, Prisma, PrismaClient } from "../../../../generated/prisma/client";
import {
    BusinessFollowUpPolicyDto,
    ConversationFollowUpDto,
    ConversationFollowUpStateDto,
    CreateConversationFollowUpRequestDto,
    FollowUpStatusDto,
    LeadSourceDto,
    LeadStatusDto,
    UpdateConversationFollowUpRequestDto,
    UpdateConversationFollowUpStateRequestDto,
    UpsertBusinessFollowUpPolicyRequestDto
} from "../../../../contracts";
import { DueConversationFollowUpCandidate, IFollowUpRepository, OpenConversationPolicyCandidate } from "./IFollowUpRepository";

export class FollowUpRepository implements IFollowUpRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async getOpenConversationPolicyCandidates(limit: number): Promise<OpenConversationPolicyCandidate[]> {
        const take = Math.max(1, Math.min(limit, 100));
        const rows = await this.prisma.$queryRaw<OpenConversationPolicyCandidateRow[]>`
            SELECT
                p."timezone" AS "policyTimezone",
                p."delayMinutes" AS "policyDelayMinutes",
                p."allowedStartHour" AS "policyAllowedStartHour",
                p."allowedEndHour" AS "policyAllowedEndHour",
                p."maxFollowUps" AS "policyMaxFollowUps",
                p."messageTemplate" AS "policyMessageTemplate",
                c."id" AS "conversationId",
                c."businessId" AS "conversationBusinessId",
                c."clientId" AS "conversationClientId",
                c."conversationStatus"::text AS "conversationStatus",
                c."channel" AS "conversationChannel",
                c."provider" AS "conversationProvider",
                c."createdAt" AS "conversationCreatedAt",
                c."lastUserMessageAt" AS "lastUserMessageAt",
                c."lastBotMessageAt" AS "lastBotMessageAt",
                c."lastFollowUpAt" AS "lastFollowUpAt",
                c."followUpCount" AS "followUpCount",
                c."nextFollowUpAt" AS "nextFollowUpAt",
                b."id" AS "businessId",
                b."businessName" AS "businessName",
                b."businessPhone" AS "businessPhone",
                b."language" AS "businessLanguage",
                cl."id" AS "clientId",
                cl."name" AS "clientName",
                cl."phoneNumber" AS "clientPhone",
                l."id" AS "leadId",
                l."source"::text AS "leadSource",
                l."status"::text AS "leadStatus",
                l."name" AS "leadName",
                l."phoneNumber" AS "leadPhoneNumber"
            FROM "Conversation" c
            INNER JOIN "Business" b ON b."id" = c."businessId"
            INNER JOIN "BusinessFollowUpPolicy" p ON p."businessId" = c."businessId"
            INNER JOIN "Client" cl ON cl."id" = c."clientId"
            LEFT JOIN LATERAL (
                SELECT lead."id", lead."source", lead."status", lead."name", lead."phoneNumber"
                FROM "Lead" lead
                WHERE lead."businessId" = c."businessId"
                  AND lead."clientId" = c."clientId"
                ORDER BY lead."createdAt" DESC, lead."id" DESC
                LIMIT 1
            ) l ON true
            WHERE
                p."enabled" = true
                AND c."conversationStatus" NOT IN ('ended', 'failure', 'schedulingConfirmed', 'schedulingFailed')
                AND c."lastBotMessageAt" IS NOT NULL
                AND (c."lastUserMessageAt" IS NULL OR c."lastUserMessageAt" < c."lastBotMessageAt")
                AND c."followUpCount" < p."maxFollowUps"
                AND NOT EXISTS (
                    SELECT 1
                    FROM "ConversationFollowUp" cf
                    WHERE cf."conversationId" = c."id"
                      AND cf."businessId" = c."businessId"
                      AND cf."status" IN ('PENDING', 'PROCESSING')
                )
            ORDER BY c."lastBotMessageAt" ASC, c."id" ASC
            LIMIT ${take}
        `;

        return rows.map(mapOpenConversationPolicyCandidate);
    }

    async getDuePendingFollowUps(now: Date, limit: number): Promise<DueConversationFollowUpCandidate[]> {
        const take = Math.max(1, Math.min(limit, 100));
        const rows = await this.prisma.$queryRaw<DueFollowUpCandidateRow[]>`
            SELECT
                cf."id" AS "followUpId",
                cf."businessId" AS "followUpBusinessId",
                cf."conversationId" AS "followUpConversationId",
                cf."leadId" AS "followUpLeadId",
                cf."status"::text AS "followUpStatus",
                cf."scheduledFor" AS "scheduledFor",
                cf."messageBody" AS "messageBody",
                cf."metadata" AS "metadata",
                p."timezone" AS "policyTimezone",
                p."delayMinutes" AS "policyDelayMinutes",
                p."allowedStartHour" AS "policyAllowedStartHour",
                p."allowedEndHour" AS "policyAllowedEndHour",
                p."maxFollowUps" AS "policyMaxFollowUps",
                p."messageTemplate" AS "policyMessageTemplate",
                c."id" AS "conversationId",
                c."businessId" AS "conversationBusinessId",
                c."clientId" AS "conversationClientId",
                c."conversationStatus"::text AS "conversationStatus",
                c."channel" AS "conversationChannel",
                c."provider" AS "conversationProvider",
                c."createdAt" AS "conversationCreatedAt",
                c."lastUserMessageAt" AS "lastUserMessageAt",
                c."lastBotMessageAt" AS "lastBotMessageAt",
                c."lastFollowUpAt" AS "lastFollowUpAt",
                c."followUpCount" AS "followUpCount",
                c."nextFollowUpAt" AS "nextFollowUpAt",
                b."id" AS "businessId",
                b."businessName" AS "businessName",
                b."businessPhone" AS "businessPhone",
                b."language" AS "businessLanguage",
                cl."id" AS "clientId",
                cl."name" AS "clientName",
                cl."phoneNumber" AS "clientPhone",
                l."id" AS "leadId",
                l."source"::text AS "leadSource",
                l."status"::text AS "leadStatus",
                l."name" AS "leadName",
                l."phoneNumber" AS "leadPhoneNumber"
            FROM "ConversationFollowUp" cf
            INNER JOIN "Conversation" c ON c."id" = cf."conversationId"
            INNER JOIN "Business" b ON b."id" = cf."businessId"
            INNER JOIN "BusinessFollowUpPolicy" p ON p."businessId" = cf."businessId"
            INNER JOIN "Client" cl ON cl."id" = c."clientId"
            LEFT JOIN "Lead" l ON l."id" = cf."leadId"
            WHERE
                cf."status" = 'PENDING'
                AND cf."scheduledFor" <= ${now}
                AND p."enabled" = true
                AND c."businessId" = cf."businessId"
                AND c."conversationStatus" NOT IN ('ended', 'failure', 'schedulingConfirmed', 'schedulingFailed')
                AND c."followUpCount" < p."maxFollowUps"
            ORDER BY cf."scheduledFor" ASC, cf."id" ASC
            LIMIT ${take}
        `;

        return rows.map(mapDueFollowUpCandidate);
    }

    async claimPendingFollowUp(followUpId: number): Promise<ConversationFollowUpDto | null> {
        const claimResult = await this.prisma.conversationFollowUp.updateMany({
            where: {
                id: followUpId,
                status: "PENDING"
            },
            data: {
                status: "PROCESSING"
            }
        });

        if (claimResult.count === 0) {
            return null;
        }

        const followUp = await this.prisma.conversationFollowUp.findUnique({
            where: {
                id: followUpId
            }
        });

        return followUp ? mapConversationFollowUp(followUp) : null;
    }

    async getBusinessFollowUpPolicy(businessId: number): Promise<BusinessFollowUpPolicyDto | null> {
        const policy = await this.prisma.businessFollowUpPolicy.findUnique({
            where: {
                businessId
            }
        });

        return policy ? mapPolicy(policy) : null;
    }

    async upsertBusinessFollowUpPolicy(businessId: number, request: UpsertBusinessFollowUpPolicyRequestDto): Promise<BusinessFollowUpPolicyDto> {
        const data = mapPolicyUpdateInput(request);
        const policy = await this.prisma.businessFollowUpPolicy.upsert({
            where: {
                businessId
            },
            create: {
                businessId,
                enabled: data.enabled ?? false,
                timezone: data.timezone ?? "UTC",
                delayMinutes: data.delayMinutes ?? 1440,
                allowedStartHour: data.allowedStartHour,
                allowedEndHour: data.allowedEndHour,
                maxFollowUps: data.maxFollowUps ?? 1,
                messageTemplate: data.messageTemplate
            },
            update: data
        });

        return mapPolicy(policy);
    }

    async getConversationFollowUpState(businessId: number, conversationId: number): Promise<ConversationFollowUpStateDto | null> {
        const conversation = await this.prisma.conversation.findFirst({
            where: {
                id: conversationId,
                businessId
            }
        });

        return conversation ? mapConversationFollowUpState(conversation) : null;
    }

    async getActiveConversationFollowUpStates(businessId?: number): Promise<ConversationFollowUpStateDto[]> {
        const conversations = await this.prisma.conversation.findMany({
            where: {
                ...(businessId ? { businessId } : {}),
                conversationStatus: {
                    notIn: ["ended", "failure", "schedulingConfirmed", "schedulingFailed"]
                }
            },
            orderBy: {
                createdAt: "asc"
            }
        });

        return conversations.map(mapConversationFollowUpState);
    }

    async updateConversationFollowUpState(conversationId: number, request: UpdateConversationFollowUpStateRequestDto): Promise<ConversationFollowUpStateDto> {
        const conversation = await this.prisma.conversation.update({
            where: {
                id: conversationId
            },
            data: {
                lastUserMessageAt: request.lastUserMessageAt === undefined ? undefined : parseNullableDate(request.lastUserMessageAt),
                lastBotMessageAt: request.lastBotMessageAt === undefined ? undefined : parseNullableDate(request.lastBotMessageAt),
                lastFollowUpAt: request.lastFollowUpAt === undefined ? undefined : parseNullableDate(request.lastFollowUpAt),
                followUpCount: request.followUpCount === undefined ? undefined : request.followUpCount,
                nextFollowUpAt: request.nextFollowUpAt === undefined ? undefined : parseNullableDate(request.nextFollowUpAt)
            }
        });

        return mapConversationFollowUpState(conversation);
    }

    async getConversationFollowUps(businessId: number, conversationId: number): Promise<ConversationFollowUpDto[]> {
        const followUps = await this.prisma.conversationFollowUp.findMany({
            where: {
                businessId,
                conversationId
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        return followUps.map(mapConversationFollowUp);
    }

    async createConversationFollowUp(businessId: number, request: CreateConversationFollowUpRequestDto): Promise<ConversationFollowUpDto> {
        const followUp = await this.prisma.conversationFollowUp.create({
            data: {
                businessId,
                conversationId: request.conversationId,
                leadId: request.leadId ?? undefined,
                status: (request.status || "PENDING") as FollowUpStatus,
                scheduledFor: parseRequiredDate(request.scheduledFor),
                sentAt: parseNullableDate(request.sentAt),
                skippedReason: normalizeNullableString(request.skippedReason),
                messageBody: normalizeNullableString(request.messageBody),
                metadata: request.metadata === undefined ? undefined : request.metadata as Prisma.InputJsonValue
            }
        });

        return mapConversationFollowUp(followUp);
    }

    async updateConversationFollowUp(businessId: number, followUpId: number, request: UpdateConversationFollowUpRequestDto): Promise<ConversationFollowUpDto> {
        const existingFollowUp = await this.prisma.conversationFollowUp.findFirst({
            where: {
                id: followUpId,
                businessId
            }
        });

        if (!existingFollowUp) {
            throw new Error(`Conversation follow-up ${followUpId} not found for business ${businessId}`);
        }

        const followUp = await this.prisma.conversationFollowUp.update({
            where: {
                id: followUpId
            },
            data: {
                leadId: request.leadId === undefined ? undefined : request.leadId,
                status: request.status === undefined ? undefined : request.status as FollowUpStatus,
                scheduledFor: request.scheduledFor === undefined ? undefined : parseRequiredDate(request.scheduledFor),
                sentAt: request.sentAt === undefined ? undefined : parseNullableDate(request.sentAt),
                skippedReason: request.skippedReason === undefined ? undefined : normalizeNullableString(request.skippedReason),
                messageBody: request.messageBody === undefined ? undefined : normalizeNullableString(request.messageBody),
                metadata: request.metadata === undefined ? undefined : request.metadata as Prisma.InputJsonValue
            }
        });

        return mapConversationFollowUp(followUp);
    }

    async deleteConversationFollowUpsCreatedBefore(businessId: number, createdBefore: Date): Promise<number> {
        const result = await this.prisma.conversationFollowUp.deleteMany({
            where: {
                businessId,
                createdAt: {
                    lt: createdBefore
                }
            }
        });

        return result.count;
    }
}

type PrismaPolicyForDto = {
    id: number;
    businessId: number;
    enabled: boolean;
    timezone: string;
    delayMinutes: number;
    allowedStartHour: number | null;
    allowedEndHour: number | null;
    maxFollowUps: number;
    messageTemplate: string | null;
    createdAt: Date;
    updatedAt: Date;
};

type DueFollowUpCandidateRow = {
    followUpId: number;
    followUpBusinessId: number;
    followUpConversationId: number;
    followUpLeadId: number | null;
    followUpStatus: string;
    scheduledFor: Date;
    messageBody: string | null;
    metadata: Prisma.JsonValue | null;
    policyTimezone: string;
    policyDelayMinutes: number;
    policyAllowedStartHour: number | null;
    policyAllowedEndHour: number | null;
    policyMaxFollowUps: number;
    policyMessageTemplate: string | null;
    conversationId: number;
    conversationBusinessId: number;
    conversationClientId: number;
    conversationStatus: string;
    conversationChannel: string;
    conversationProvider: string;
    conversationCreatedAt: Date;
    lastUserMessageAt: Date | null;
    lastBotMessageAt: Date | null;
    lastFollowUpAt: Date | null;
    followUpCount: number;
    nextFollowUpAt: Date | null;
    businessId: number;
    businessName: string;
    businessPhone: string;
    businessLanguage: string;
    clientId: number;
    clientName: string | null;
    clientPhone: string;
    leadId: number | null;
    leadSource: string | null;
    leadStatus: string | null;
    leadName: string | null;
    leadPhoneNumber: string | null;
};

type OpenConversationPolicyCandidateRow = {
    policyTimezone: string;
    policyDelayMinutes: number;
    policyAllowedStartHour: number | null;
    policyAllowedEndHour: number | null;
    policyMaxFollowUps: number;
    policyMessageTemplate: string | null;
    conversationId: number;
    conversationBusinessId: number;
    conversationClientId: number;
    conversationStatus: string;
    conversationChannel: string;
    conversationProvider: string;
    conversationCreatedAt: Date;
    lastUserMessageAt: Date | null;
    lastBotMessageAt: Date | null;
    lastFollowUpAt: Date | null;
    followUpCount: number;
    nextFollowUpAt: Date | null;
    businessId: number;
    businessName: string;
    businessPhone: string;
    businessLanguage: string;
    clientId: number;
    clientName: string | null;
    clientPhone: string;
    leadId: number | null;
    leadSource: string | null;
    leadStatus: string | null;
    leadName: string | null;
    leadPhoneNumber: string | null;
};

type PrismaConversationForFollowUpState = {
    id: number;
    businessId: number;
    clientId: number;
    conversationStatus: string;
    channel: string;
    provider: string;
    createdAt: Date;
    lastUserMessageAt: Date | null;
    lastBotMessageAt: Date | null;
    lastFollowUpAt: Date | null;
    followUpCount: number;
    nextFollowUpAt: Date | null;
};

type PrismaConversationFollowUpForDto = {
    id: number;
    businessId: number;
    conversationId: number;
    leadId: number | null;
    status: string;
    scheduledFor: Date;
    sentAt: Date | null;
    skippedReason: string | null;
    messageBody: string | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
};

function mapDueFollowUpCandidate(row: DueFollowUpCandidateRow): DueConversationFollowUpCandidate {
    return {
        followUp: {
            id: row.followUpId,
            businessId: row.followUpBusinessId,
            conversationId: row.followUpConversationId,
            leadId: row.followUpLeadId,
            status: "PENDING",
            scheduledFor: row.scheduledFor.toISOString(),
            messageBody: row.messageBody,
            metadata: row.metadata
        },
        policy: {
            timezone: row.policyTimezone,
            delayMinutes: row.policyDelayMinutes,
            allowedStartHour: row.policyAllowedStartHour,
            allowedEndHour: row.policyAllowedEndHour,
            maxFollowUps: row.policyMaxFollowUps,
            messageTemplate: row.policyMessageTemplate
        },
        conversation: {
            id: row.conversationId,
            businessId: row.conversationBusinessId,
            clientId: row.conversationClientId,
            status: row.conversationStatus,
            channel: row.conversationChannel,
            provider: row.conversationProvider,
            createdAt: row.conversationCreatedAt.toISOString(),
            lastUserMessageAt: row.lastUserMessageAt?.toISOString() || null,
            lastBotMessageAt: row.lastBotMessageAt?.toISOString() || null,
            lastFollowUpAt: row.lastFollowUpAt?.toISOString() || null,
            followUpCount: row.followUpCount,
            nextFollowUpAt: row.nextFollowUpAt?.toISOString() || null
        },
        business: {
            id: row.businessId,
            name: row.businessName,
            phone: row.businessPhone,
            language: row.businessLanguage
        },
        client: {
            id: row.clientId,
            name: row.clientName,
            phone: row.clientPhone
        },
        lead: row.leadId
            ? {
                id: row.leadId,
                source: row.leadSource as LeadSourceDto,
                status: row.leadStatus as LeadStatusDto,
                name: row.leadName,
                phoneNumber: row.leadPhoneNumber
            }
            : null
    };
}

function mapOpenConversationPolicyCandidate(row: OpenConversationPolicyCandidateRow): OpenConversationPolicyCandidate {
    return {
        policy: {
            timezone: row.policyTimezone,
            delayMinutes: row.policyDelayMinutes,
            allowedStartHour: row.policyAllowedStartHour,
            allowedEndHour: row.policyAllowedEndHour,
            maxFollowUps: row.policyMaxFollowUps,
            messageTemplate: row.policyMessageTemplate
        },
        conversation: {
            id: row.conversationId,
            businessId: row.conversationBusinessId,
            clientId: row.conversationClientId,
            status: row.conversationStatus,
            channel: row.conversationChannel,
            provider: row.conversationProvider,
            createdAt: row.conversationCreatedAt.toISOString(),
            lastUserMessageAt: row.lastUserMessageAt?.toISOString() || null,
            lastBotMessageAt: row.lastBotMessageAt?.toISOString() || null,
            lastFollowUpAt: row.lastFollowUpAt?.toISOString() || null,
            followUpCount: row.followUpCount,
            nextFollowUpAt: row.nextFollowUpAt?.toISOString() || null
        },
        business: {
            id: row.businessId,
            name: row.businessName,
            phone: row.businessPhone,
            language: row.businessLanguage
        },
        client: {
            id: row.clientId,
            name: row.clientName,
            phone: row.clientPhone
        },
        lead: row.leadId
            ? {
                id: row.leadId,
                source: row.leadSource as LeadSourceDto,
                status: row.leadStatus as LeadStatusDto,
                name: row.leadName,
                phoneNumber: row.leadPhoneNumber
            }
            : null
    };
}

function mapPolicy(policy: PrismaPolicyForDto): BusinessFollowUpPolicyDto {
    return {
        id: policy.id,
        businessId: policy.businessId,
        enabled: policy.enabled,
        timezone: policy.timezone,
        delayMinutes: policy.delayMinutes,
        allowedStartHour: policy.allowedStartHour,
        allowedEndHour: policy.allowedEndHour,
        maxFollowUps: policy.maxFollowUps,
        messageTemplate: policy.messageTemplate,
        createdAt: policy.createdAt.toISOString(),
        updatedAt: policy.updatedAt.toISOString()
    };
}

function mapConversationFollowUpState(conversation: PrismaConversationForFollowUpState): ConversationFollowUpStateDto {
    return {
        conversationId: conversation.id,
        businessId: conversation.businessId,
        clientId: conversation.clientId,
        status: conversation.conversationStatus,
        channel: conversation.channel,
        provider: conversation.provider,
        createdAt: conversation.createdAt.toISOString(),
        lastUserMessageAt: conversation.lastUserMessageAt?.toISOString() || null,
        lastBotMessageAt: conversation.lastBotMessageAt?.toISOString() || null,
        lastFollowUpAt: conversation.lastFollowUpAt?.toISOString() || null,
        followUpCount: conversation.followUpCount,
        nextFollowUpAt: conversation.nextFollowUpAt?.toISOString() || null
    };
}

function mapConversationFollowUp(followUp: PrismaConversationFollowUpForDto): ConversationFollowUpDto {
    return {
        id: followUp.id,
        businessId: followUp.businessId,
        conversationId: followUp.conversationId,
        leadId: followUp.leadId,
        status: followUp.status as FollowUpStatusDto,
        scheduledFor: followUp.scheduledFor.toISOString(),
        sentAt: followUp.sentAt?.toISOString() || null,
        skippedReason: followUp.skippedReason,
        messageBody: followUp.messageBody,
        metadata: followUp.metadata,
        createdAt: followUp.createdAt.toISOString(),
        updatedAt: followUp.updatedAt.toISOString()
    };
}

type PolicyUpdateValues = {
    enabled?: boolean;
    timezone?: string;
    delayMinutes?: number;
    allowedStartHour?: number | null;
    allowedEndHour?: number | null;
    maxFollowUps?: number;
    messageTemplate?: string | null;
};

function mapPolicyUpdateInput(request: UpsertBusinessFollowUpPolicyRequestDto): PolicyUpdateValues {
    return {
        enabled: request.enabled,
        timezone: normalizeOptionalString(request.timezone),
        delayMinutes: request.delayMinutes,
        allowedStartHour: request.allowedStartHour === undefined ? undefined : request.allowedStartHour,
        allowedEndHour: request.allowedEndHour === undefined ? undefined : request.allowedEndHour,
        maxFollowUps: request.maxFollowUps,
        messageTemplate: request.messageTemplate === undefined ? undefined : normalizeNullableString(request.messageTemplate)
    };
}

function parseRequiredDate(value: string): Date {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        throw new Error(`Invalid date: ${value}`);
    }

    return date;
}

function parseNullableDate(value?: string | null): Date | null {
    if (!value) {
        return null;
    }

    return parseRequiredDate(value);
}

function normalizeOptionalString(value?: string | null): string | undefined {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : undefined;
}

function normalizeNullableString(value?: string | null): string | null {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : null;
}
