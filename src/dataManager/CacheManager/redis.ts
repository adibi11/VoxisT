import Redis from "ioredis";
import { ConversationCacheState } from "../Types/messageTypes";
import { ICacheManager } from "./cacheInterface";

export const connection = {
    host: "127.0.0.1",
    port: 6379,
};

export const redisClient = new Redis(connection);

export class RedisCacheManager implements ICacheManager {
    async getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null> {
        const key = `conversation:${clientId}:${businessId}`;
        const data = await redisClient.get(key);
        if (!data) return null;
        return JSON.parse(data);
    }

    async setCacheState(clientId: number, businessId: number, state: ConversationCacheState): Promise<void> {
        const key = `conversation:${clientId}:${businessId}`;
        await redisClient.set(key, JSON.stringify(state));
    }
    async setCacheConversationKey(clientId: number, businessId: number, conversationKey: string): Promise<void> {
        const key = `conversationKey:${clientId}:${businessId}`;
        await redisClient.set(key, conversationKey);
    }
    async getCacheConversationKey(clientId: number, businessId: number): Promise<string | null> {
        const key = `conversationKey:${clientId}:${businessId}`;
        const data = await redisClient.get(key);
        return data || null;
    }
    async releaseCacheConversationKey(clientId: number, businessId: number): Promise<void> {
        const key = `conversationKey:${clientId}:${businessId}`;
        await redisClient.del(key);
    }

}


