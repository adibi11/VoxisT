
import { ConversationCacheState } from "../Types/messageTypes";

export interface ICacheManager {
    getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null>;
    setCacheState(clientId: number, businessId: number, state: ConversationCacheState): Promise<void>;
    setCacheConversationKey(clientId: number, businessId: number, conversationKey: string): Promise<void>;
    getCacheConversationKey(clientId: number, businessId: number): Promise<string | null>;
    releaseCacheConversationKey(clientId: number, businessId: number): Promise<void>;
}