import { ConversationCacheState, ConversationEntity, BusinessContext } from "../Types/messageTypes";
import { BusinessDto, BusinessActionDto, CommunicationChannel, MessageProvider } from "../Types/apiTypes";
import { Client } from "../Types/messageTypes";
import { ConversationState } from "../Types/stateMachineTypes";
import { BusinessParamDefinition } from "../Types/paramTypes";
import {
    AdminCreateBusinessRequestDto,
    AdminCreateUserRequestDto,
    AuthUserDto,
    BusinessMemberDto,
    BusinessResponseMetricsDto,
    BusinessSettingsDto,
    BusinessSummaryDto,
    BusinessUserRoleDto,
    ClientSummaryDto,
    ConversationMessagesResponseDto,
    ConversationMessageDto,
    ConversationSummaryDto,
    PlatformRoleDto,
    UpdateBusinessSettingsRequestDto
} from "../../contracts";
import { ILeadRepository } from "./Repositories/LeadRepo/ILeadRepository";
import { IFollowUpRepository } from "./Repositories/FollowUpRepo/IFollowUpRepository";
import { IBusinessChannelRepository } from "./Repositories/BusinessChannelRepo/IBusinessChannelRepository";
import { IBusinessParameterRepository } from "./Repositories/BusinessParameterRepo/IBusinessParameterRepository";
import { IIntegrationConnectionRepository } from "./Repositories/IntegrationConnectionRepo/IIntegrationConnectionRepository";
import { IIncomingLeadRepository } from "./Repositories/IncomingLeadRepo/IIncomingLeadRepository";
import { IExternalLeadRepository } from "./Repositories/ExternalLeadRepo/IExternalLeadRepository";
import { IIngestionOutboxRepository } from "./Repositories/IngestionOutboxRepo/IIngestionOutboxRepository";
import { ILeadIngestionRepository } from "./Repositories/LeadIngestionRepo/ILeadIngestionRepository";
import { ILeadProcessingRepository } from "./Repositories/LeadProcessingRepo/ILeadProcessingRepository";
import { IProviderWebhookEventRepository } from "./Repositories/ProviderWebhookEventRepo/IProviderWebhookEventRepository";
import { IMetaLeadFormSubscriptionRepository } from "./Repositories/MetaLeadFormSubscriptionRepo/IMetaLeadFormSubscriptionRepository";
import { IPushDeviceRepository } from "./Repositories/PushDeviceRepo/IPushDeviceRepository";
import { ITaskRepository } from "./Repositories/TaskRepo/ITaskRepository";
import { ISchemaRepository } from "./Repositories/SchemaRepo/ISchemaRepository";
import { ICaseRepository } from "./Repositories/CaseRepo/ICaseRepository";

import { IDocumentRepository } from "./Repositories/DocumentRepo/IDocumentRepository";
import { IInstagramRepository } from "../../InstagramCommentAutomation/instagramTypes";


export interface IDatabaseClient {

    //Statiing implementing by repositories as the interface becomes larger

    readonly leadRepository: ILeadRepository;
    readonly followUpRepository: IFollowUpRepository;
    readonly businessChannelRepository: IBusinessChannelRepository;
    readonly businessParameterRepository: IBusinessParameterRepository;
    readonly integrationConnectionRepository: IIntegrationConnectionRepository;
    readonly incomingLeadRepository: IIncomingLeadRepository;
    readonly externalLeadRepository: IExternalLeadRepository;
    readonly ingestionOutboxRepository: IIngestionOutboxRepository;
    readonly leadIngestionRepository: ILeadIngestionRepository;
    readonly leadProcessingRepository: ILeadProcessingRepository;
    readonly providerWebhookEventRepository: IProviderWebhookEventRepository;
    readonly metaLeadFormSubscriptionRepository: IMetaLeadFormSubscriptionRepository;
    readonly taskRepository: ITaskRepository;
    readonly schemaRepository: ISchemaRepository;
    readonly caseRepository: ICaseRepository;
    
    readonly documentRepository: IDocumentRepository;
    readonly pushDeviceRepository: IPushDeviceRepository;
    readonly instagramRepository: IInstagramRepository;

    getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null>;
    getCacheStateByConversationId(conversationId: number): Promise<ConversationCacheState | null>;
    getLatestConversationCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null>;
    getConversationEntity(clientId: number, businessId: number): Promise<ConversationEntity>;
    createMessage(
        conversationId: number,
        type: "user" | "bot" | "human",
        content: string,
        idempotencyKey?: string
    ): Promise<ConversationMessageDto>;
    createDbConversation(clientId: number, businessId: number,content: string, channel?: CommunicationChannel, provider?: MessageProvider): Promise<ConversationCacheState>;
    createDbBusiness(businessDto: BusinessDto): Promise<void>;
    getOrCreateClientByPhone(phoneNumber:string):Promise<Client>;
    getClientPhoneNumber(clientId: number): Promise<string | null>;
    updateClientName(clientId: number, name: string): Promise<void>;
    upsertParamAnswer(clientId: number, conversationId: number,businessId: number, paramName: string, paramValue: string): Promise<void>;
    getBusiness(businessId: number): Promise<BusinessDto | null>;
    getBusinessContext(businessId: number): Promise<BusinessContext | null>;
    upsertBusinessContext(context: BusinessContext): Promise<BusinessContext>;
    updateConversationState(conversationId: number, state: ConversationState): Promise<void>;
    registerBusinessOwner(email: string, passwordHash: string, displayName: string | undefined, businessDto: BusinessDto, platformRole?: PlatformRoleDto): Promise<AuthUserDto>;
    getUserWithPasswordByEmail(email: string): Promise<(AuthUserDto & { passwordHash: string }) | null>;
    getUserById(userId: number): Promise<AuthUserDto | null>;
    createRefreshSession(userId: number, tokenHash: string, familyId: string, expiresAt: Date): Promise<void>;
    rotateRefreshSession(tokenHash: string, replacementHash: string, replacementExpiresAt: Date): Promise<AuthUserDto | null>;
    revokeRefreshSession(tokenHash: string): Promise<boolean>;
    getAllUsers(): Promise<AuthUserDto[]>;
    updateUserPassword(userId: number, passwordHash: string): Promise<AuthUserDto | null>;
    createAppUser(request: Omit<AdminCreateUserRequestDto, "password"> & { passwordHash: string }): Promise<AuthUserDto>;
    upsertBusinessMembership(userId: number, businessId: number, role: BusinessUserRoleDto): Promise<AuthUserDto | null>;
    deleteBusinessMembership(userId: number, businessId: number): Promise<boolean>;
    getBusinessMembers(businessId: number): Promise<BusinessMemberDto[]>;
    isBusinessMember(userId: number, businessId: number): Promise<boolean>;
    getBusinessesForUser(userId: number): Promise<BusinessSummaryDto[]>;
    getAllBusinesses(): Promise<BusinessSummaryDto[]>;
    createBusiness(request: AdminCreateBusinessRequestDto): Promise<BusinessSummaryDto>;
    getBusinessSettings(businessId: number): Promise<BusinessSettingsDto | null>;
    updateBusinessSettings(businessId: number, request: UpdateBusinessSettingsRequestDto): Promise<BusinessSettingsDto>;
    getBusinessResponseMetrics(businessId: number, from?: Date, to?: Date): Promise<BusinessResponseMetricsDto>;
    getActiveBusinessParameterNames(businessId: number): Promise<string[]>;
    getActiveBusinessParameterDefinitions(businessId: number): Promise<BusinessParamDefinition[]>;
    // Creates or reschedules the AI callback task for a conversation
    // (idempotent per business+client+conversation) and writes the
    // TASK_CREATED/TASK_UPDATED activity event that drives the owner's push
    // notification. Ensures a qualified lead exists for the client.
    upsertConversationScheduledTask(args: {
        businessId: number;
        clientId: number;
        conversationId: number;
        scheduledFor: Date;
        clientName?: string | null;
        clientPhone?: string | null;
        summary?: string | null;
    }): Promise<{ taskId: number; created: boolean }>;
    scoreAndCreateLeadForConversation(clientId: number, businessId: number, conversationId: number): Promise<void>;
    upsertBusiness(businessDto: BusinessDto, businessId: number): Promise<BusinessDto>;
    upsertBusinessAction(businessId: number, actionDto: BusinessActionDto): Promise<void>;
    getBusinessAction(businessId: number): Promise<BusinessActionDto>;
    getMessagesByConversation(businessId: number, conversationId: number): Promise<ConversationMessagesResponseDto | null>;
    getConversationsByBusinessAndClient(businessId: number, clientId?: number): Promise<ConversationSummaryDto[]>;
    getClientsByBusiness(businessId: number): Promise<ClientSummaryDto[]>;

    // Read-only: is the client/business's active conversation human-managed?
    // Used by the webhook to classify a message into the bot or human lane
    // before it's ever enqueued - never creates a conversation as a side effect.
    isConversationHumanManaged(clientId: number, businessId: number): Promise<boolean>;
    getConversationForBusinessAndClient(businessId: number, clientId: number, conversationId: number): Promise<ConversationSummaryDto | null>;
    // Marks a conversation humanTakeover/humanManaged and records who took it over.
    setHumanTakeover(conversationId: number, userId: number): Promise<ConversationSummaryDto>;
    // Ends a takeover: status -> ended, releasedAt set. humanManaged stays true.
    releaseHumanTakeover(conversationId: number): Promise<ConversationSummaryDto>;
    // Starts a brand-new conversation already owned by a human (used when an
    // agent opens a conversation with a client that may not exist yet).
    createHumanConversation(
        clientId: number,
        businessId: number,
        userId: number,
        channel?: CommunicationChannel,
        provider?: MessageProvider
    ): Promise<ConversationSummaryDto>;
    // Writes the BusinessActivityEvent that the existing push-notification
    // pipeline (BusinessActivityEventProcessorService) picks up.
    createConversationMessageActivityEvent(businessId: number, conversationId: number, messageId: number): Promise<void>;
}

