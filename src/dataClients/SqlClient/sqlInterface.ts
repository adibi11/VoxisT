import { ConversationCacheState, ConversationEntity, BusinessContext } from "../Types/messageTypes";
import { BusinessDto, BusinessActionDto, CommunicationChannel, MessageProvider } from "../Types/apiTypes";
import { Client } from "../Types/messageTypes";
import { ConversationState } from "../Types/stateMachineTypes";
import {
    AdminCreateUserRequestDto,
    AuthUserDto,
    BusinessMemberDto,
    BusinessResponseMetricsDto,
    BusinessSettingsDto,
    BusinessSummaryDto,
    BusinessUserRoleDto,
    ClientSummaryDto,
    ConversationMessagesResponseDto,
    ConversationSummaryDto,
    PlatformRoleDto,
    UpdateBusinessSettingsRequestDto
} from "../../contracts";
import { ILeadRepository } from "./Repositories/LeadRepo/ILeadRepository";
import { IFollowUpRepository } from "./Repositories/FollowUpRepo/IFollowUpRepository";
import { IBusinessChannelRepository } from "./Repositories/BusinessChannelRepo/IBusinessChannelRepository";
import { IIntegrationConnectionRepository } from "./Repositories/IntegrationConnectionRepo/IIntegrationConnectionRepository";
import { IIncomingLeadRepository } from "./Repositories/IncomingLeadRepo/IIncomingLeadRepository";
import { IExternalLeadRepository } from "./Repositories/ExternalLeadRepo/IExternalLeadRepository";
import { IIngestionOutboxRepository } from "./Repositories/IngestionOutboxRepo/IIngestionOutboxRepository";
import { ILeadIngestionRepository } from "./Repositories/LeadIngestionRepo/ILeadIngestionRepository";
import { ILeadProcessingRepository } from "./Repositories/LeadProcessingRepo/ILeadProcessingRepository";
import { IProviderWebhookEventRepository } from "./Repositories/ProviderWebhookEventRepo/IProviderWebhookEventRepository";
import { IMetaLeadFormSubscriptionRepository } from "./Repositories/MetaLeadFormSubscriptionRepo/IMetaLeadFormSubscriptionRepository";
import { ITaskRepository } from "./Repositories/TaskRepo/ITaskRepository";


export interface IDatabaseClient {

    //Statiing implementing by repositories as the interface becomes larger

    readonly leadRepository: ILeadRepository;
    readonly followUpRepository: IFollowUpRepository;
    readonly businessChannelRepository: IBusinessChannelRepository;
    readonly integrationConnectionRepository: IIntegrationConnectionRepository;
    readonly incomingLeadRepository: IIncomingLeadRepository;
    readonly externalLeadRepository: IExternalLeadRepository;
    readonly ingestionOutboxRepository: IIngestionOutboxRepository;
    readonly leadIngestionRepository: ILeadIngestionRepository;
    readonly leadProcessingRepository: ILeadProcessingRepository;
    readonly providerWebhookEventRepository: IProviderWebhookEventRepository;
    readonly metaLeadFormSubscriptionRepository: IMetaLeadFormSubscriptionRepository;
    readonly taskRepository: ITaskRepository;


    getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null>;
    getCacheStateByConversationId(conversationId: number): Promise<ConversationCacheState | null>;
    getLatestConversationCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null>;
    getConversationEntity(clientId: number, businessId: number): Promise<ConversationEntity>;
    createMessage(conversationId: number,type: "user"| "bot",content: string): Promise<void> ;
    createDbConversation(clientId: number, businessId: number,content: string, channel?: CommunicationChannel, provider?: MessageProvider): Promise<ConversationCacheState>;
    createDbBusiness(businessDto: BusinessDto): Promise<void>;
    getOrCreateClientByPhone(phoneNumber:string):Promise<Client>;
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
    getBusinessSettings(businessId: number): Promise<BusinessSettingsDto | null>;
    updateBusinessSettings(businessId: number, request: UpdateBusinessSettingsRequestDto): Promise<BusinessSettingsDto>;
    getBusinessResponseMetrics(businessId: number, from?: Date, to?: Date): Promise<BusinessResponseMetricsDto>;
    getActiveBusinessParameterNames(businessId: number): Promise<string[]>;
    scoreAndCreateLeadForConversation(clientId: number, businessId: number, conversationId: number): Promise<void>;
    upsertBusiness(businessDto: BusinessDto, businessId: number): Promise<BusinessDto>;
    upsertBusinessAction(businessId: number, actionDto: BusinessActionDto): Promise<void>;
    getBusinessAction(businessId: number): Promise<BusinessActionDto>;
    getMessagesByConversation(businessId: number, conversationId: number): Promise<ConversationMessagesResponseDto | null>;
    getConversationsByBusinessAndClient(businessId: number, clientId?: number): Promise<ConversationSummaryDto[]>;
    getClientsByBusiness(businessId: number): Promise<ClientSummaryDto[]>;
}
