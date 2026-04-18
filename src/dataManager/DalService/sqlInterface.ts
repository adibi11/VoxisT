import { ConversationCacheState, ConversationEntity } from "../Types/messageTypes";
import { BusinessDto } from "../Types/apiTypes";
import { Client } from "../Types/messageTypes";


export interface ISqlInterface {
    getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null>;
    getConversationEntity(clientId: number, businessId: number): Promise<ConversationEntity>;
    createMessage(conversationId: number,type: "user"| "bot",content: string): Promise<void> ;
    createDbConversation(clientId: number, businessId: number,content: string): Promise<void>;
    createDbBusiness(businessDto: BusinessDto): Promise<void>;
    getOrCreateClientByPhone(phoneNumber:string):Promise<Client>;
}