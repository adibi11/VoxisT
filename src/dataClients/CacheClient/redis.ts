import Redis from "ioredis";
import { ConversationCacheState } from "../Types/messageTypes";
import { ICacheManager } from "./cacheInterface";

export const connection ={
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
}

export const redisClient = new Redis(connection);

export class RedisCacheManager implements ICacheManager {

  //  STATE
  async getCacheState(clientId: number, businessId: number): Promise<ConversationCacheState | null> {
    const conversationId = await this.getActiveConversationId(clientId, businessId);
    if (!conversationId) return null;
    return this.getCacheStateByConversationId(conversationId);
  }

  async setCacheState(clientId: number, businessId: number, state: ConversationCacheState): Promise<void> {
    await this.setActiveConversationId(clientId, businessId, state.conversationId);
    await this.setCacheStateByConversationId(state.conversationId, state);
  }

  async getCacheStateByConversationId(conversationId: number): Promise<ConversationCacheState | null> {
    const key = `conversation:${conversationId}`;
    const data = await redisClient.get(key);
    if (!data) return null;
    return JSON.parse(data);
  }

  async setCacheStateByConversationId(conversationId: number, state: ConversationCacheState): Promise<void> {
    const key = `conversation:${conversationId}`;
    await redisClient.set(key, JSON.stringify(state));
  }

  async getActiveConversationId(clientId: number, businessId: number): Promise<number | null> {
    const key = `activeConversation:${clientId}:${businessId}`;
    const data = await redisClient.get(key);
    if (!data) return null;
    const conversationId = Number(data);
    return Number.isFinite(conversationId) ? conversationId : null;
  }

  async setActiveConversationId(clientId: number, businessId: number, conversationId: number): Promise<void> {
    const key = `activeConversation:${clientId}:${businessId}`;
    await redisClient.set(key, String(conversationId));
  }

  //  LOCK
  async acquireLock(clientId: number, businessId: number): Promise<boolean> {
    const lockKey = `lock:${clientId}:${businessId}`;

    const result = await redisClient.set(lockKey, "1", "EX", 5, "NX");

    return result === "OK";
  }

  async releaseLock(clientId: number, businessId: number): Promise<void> {
    const lockKey = `lock:${clientId}:${businessId}`;
    await redisClient.del(lockKey);
  }
}

