
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

    //  HUMAN TAKEOVER CANCELLATION
    // Marks a conversation so the outbound worker drops any "bot"-origin job
    // it dequeues for it, even if that job was enqueued before the takeover.
    setTakeoverCancellation(businessId: number, clientId: number, conversationId: number): Promise<void>;
    // Cleared on release - not on a TTL, since a takeover has no fixed duration.
    clearTakeoverCancellation(businessId: number, clientId: number, conversationId: number): Promise<void>;
    isTakeoverCancelled(businessId: number, clientId: number, conversationId: number): Promise<boolean>;
}
