import {
    BusinessFollowUpPolicyDto,
    ConversationFollowUpDto,
    ConversationFollowUpStateDto,
    CreateConversationFollowUpRequestDto,
    UpdateConversationFollowUpRequestDto,
    UpdateConversationFollowUpStateRequestDto,
    UpsertBusinessFollowUpPolicyRequestDto
} from "../../../../contracts";

export interface IFollowUpRepository {
    getBusinessFollowUpPolicy(businessId: number): Promise<BusinessFollowUpPolicyDto | null>;
    upsertBusinessFollowUpPolicy(businessId: number, request: UpsertBusinessFollowUpPolicyRequestDto): Promise<BusinessFollowUpPolicyDto>;
    getConversationFollowUpState(businessId: number, conversationId: number): Promise<ConversationFollowUpStateDto | null>;
    getActiveConversationFollowUpStates(businessId?: number): Promise<ConversationFollowUpStateDto[]>;
    updateConversationFollowUpState(conversationId: number, request: UpdateConversationFollowUpStateRequestDto): Promise<ConversationFollowUpStateDto>;
    getConversationFollowUps(businessId: number, conversationId: number): Promise<ConversationFollowUpDto[]>;
    createConversationFollowUp(businessId: number, request: CreateConversationFollowUpRequestDto): Promise<ConversationFollowUpDto>;
    updateConversationFollowUp(businessId: number, followUpId: number, request: UpdateConversationFollowUpRequestDto): Promise<ConversationFollowUpDto>;
    deleteConversationFollowUpsCreatedBefore(createdBefore: Date): Promise<number>;
}
