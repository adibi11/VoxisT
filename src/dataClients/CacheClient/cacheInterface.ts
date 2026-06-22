
import { ConversationCacheState } from "../Types/messageTypes";

export interface ICacheManager {
    getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null>;
    setCacheState(clientId: number, businessId: number, state: ConversationCacheState): Promise<void>;
    getCacheStateByConversationId(conversationId: number): Promise<ConversationCacheState | null>;
    setCacheStateByConversationId(conversationId: number, state: ConversationCacheState): Promise<void>;
    getActiveConversationId(clientId: number, businessId: number): Promise<number | null>;
    setActiveConversationId(clientId: number, businessId: number, conversationId: number): Promise<void>;
    acquireLock(clientId: number, businessId: number): Promise<boolean>;
    releaseLock(clientId: number, businessId: number): Promise<void>;
}
