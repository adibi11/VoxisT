import {
    BusinessFollowUpPolicyDto,
    ConversationFollowUpDto,
    ConversationFollowUpStateDto,
    CreateConversationFollowUpRequestDto,
    LeadSourceDto,
    LeadStatusDto,
    UpdateConversationFollowUpRequestDto,
    UpdateConversationFollowUpStateRequestDto,
    UpsertBusinessFollowUpPolicyRequestDto
} from "../../../../contracts";

export type DueConversationFollowUpCandidate = {
    followUp: {
        id: number;
        businessId: number;
        conversationId: number;
        leadId?: number | null;
        status: "PENDING";
        scheduledFor: string;
        messageBody?: string | null;
        metadata?: unknown;
    };
    policy: {
        timezone: string;
        delayMinutes: number;
        allowedStartHour?: number | null;
        allowedEndHour?: number | null;
        maxFollowUps: number;
        messageTemplate?: string | null;
    };
    conversation: {
        id: number;
        businessId: number;
        clientId: number;
        status: string;
        channel: string;
        provider: string;
        createdAt: string;
        lastUserMessageAt?: string | null;
        lastBotMessageAt?: string | null;
        lastFollowUpAt?: string | null;
        followUpCount: number;
        nextFollowUpAt?: string | null;
    };
    business: {
        id: number;
        name: string;
        phone: string;
        language: string;
    };
    client: {
        id: number;
        name?: string | null;
        phone: string;
    };
    lead?: {
        id: number;
        source: LeadSourceDto;
        status: LeadStatusDto;
        name?: string | null;
        phoneNumber?: string | null;
    } | null;
};

export type OpenConversationPolicyCandidate = Omit<DueConversationFollowUpCandidate, "followUp">;

export interface IFollowUpRepository {
    getOpenConversationPolicyCandidates(limit: number): Promise<OpenConversationPolicyCandidate[]>;
    getDuePendingFollowUps(now: Date, limit: number): Promise<DueConversationFollowUpCandidate[]>;
    claimPendingFollowUp(followUpId: number): Promise<ConversationFollowUpDto | null>;
    getBusinessFollowUpPolicy(businessId: number): Promise<BusinessFollowUpPolicyDto | null>;
    upsertBusinessFollowUpPolicy(businessId: number, request: UpsertBusinessFollowUpPolicyRequestDto): Promise<BusinessFollowUpPolicyDto>;
    getConversationFollowUpState(businessId: number, conversationId: number): Promise<ConversationFollowUpStateDto | null>;
    getActiveConversationFollowUpStates(businessId?: number): Promise<ConversationFollowUpStateDto[]>;
    updateConversationFollowUpState(conversationId: number, request: UpdateConversationFollowUpStateRequestDto): Promise<ConversationFollowUpStateDto>;
    getConversationFollowUps(businessId: number, conversationId: number): Promise<ConversationFollowUpDto[]>;
    createConversationFollowUp(businessId: number, request: CreateConversationFollowUpRequestDto): Promise<ConversationFollowUpDto>;
    updateConversationFollowUp(businessId: number, followUpId: number, request: UpdateConversationFollowUpRequestDto): Promise<ConversationFollowUpDto>;
    deleteConversationFollowUpsCreatedBefore(businessId: number, createdBefore: Date): Promise<number>;
}
