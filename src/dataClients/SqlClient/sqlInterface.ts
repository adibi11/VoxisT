import { ConversationCacheState, ConversationEntity, BusinessContext } from "../Types/messageTypes";
import { BusinessDto, BusinessActionDto, CommunicationChannel, MessageProvider } from "../Types/apiTypes";
import { Client } from "../Types/messageTypes";
import { ConversationState } from "../Types/stateMachineTypes";
import { AuthUserDto, BusinessSummaryDto, ClientSummaryDto, ConversationMessagesResponseDto, ConversationSummaryDto, PlatformRoleDto } from "../../contracts";
import { ILeadRepository } from "./Repositories/LeadRepo/ILeadRepository";
import { IFollowUpRepository } from "./Repositories/FollowUpRepo/IFollowUpRepository";


export interface IDatabaseClient {

    //Statiing implementing by repositories as the interface becomes larger

    readonly leadRepository: ILeadRepository;
    readonly followUpRepository: IFollowUpRepository;


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
    getAllUsers(): Promise<AuthUserDto[]>;
    updateUserPassword(userId: number, passwordHash: string): Promise<AuthUserDto | null>;
    getBusinessesForUser(userId: number): Promise<BusinessSummaryDto[]>;
    getAllBusinesses(): Promise<BusinessSummaryDto[]>;
    upsertBusiness(businessDto: BusinessDto, businessId: number): Promise<BusinessDto>;
    upsertBusinessAction(businessId: number, actionDto: BusinessActionDto): Promise<void>;
    getBusinessAction(businessId: number): Promise<BusinessActionDto>;
    getMessagesByConversation(businessId: number, conversationId: number): Promise<ConversationMessagesResponseDto | null>;
    getConversationsByBusinessAndClient(businessId: number, clientId?: number): Promise<ConversationSummaryDto[]>;
    getClientsByBusiness(businessId: number): Promise<ClientSummaryDto[]>;
}
