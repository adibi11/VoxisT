
import { ConversationCacheState } from "../Types/messageTypes";

export interface ICacheManager {
    getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null>;
    setCacheState(clientId: number, businessId: number, state: ConversationCacheState): Promise<void>;
    acquireLock(clientId: number, businessId: number): Promise<boolean>;
    releaseLock(clientId: number, businessId: number): Promise<void>;
}