import { FollowUpStatus, Prisma, PrismaClient } from "../../../../generated/prisma/client";
import {
    BusinessFollowUpPolicyDto,
    ConversationFollowUpDto,
    ConversationFollowUpStateDto,
    CreateConversationFollowUpRequestDto,
    FollowUpStatusDto,
    UpdateConversationFollowUpRequestDto,
    UpdateConversationFollowUpStateRequestDto,
    UpsertBusinessFollowUpPolicyRequestDto
} from "../../../../contracts";
import { IFollowUpRepository } from "./IFollowUpRepository";

export class FollowUpRepository implements IFollowUpRepository {
    constructor(private readonly prisma: PrismaClient) {}

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

    async deleteConversationFollowUpsCreatedBefore(createdBefore: Date): Promise<number> {
        const result = await this.prisma.conversationFollowUp.deleteMany({
            where: {
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

type PrismaConversationForFollowUpState = {
    id: number;
    businessId: number;
    clientId: number;
    conversationStatus: string;
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
