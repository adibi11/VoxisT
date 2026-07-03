import Redis from "ioredis";
import { ILogger, logger } from "../../logging/logger";
import { ConversationCacheState } from "../Types/messageTypes";
import { ICacheManager } from "./cacheInterface";

const useTls = process.env.REDIS_TLS === "true";

export const connection ={
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  ...(useTls ? { tls: {} } : {}),
}

export const redisClient = new Redis(connection);
const redisLogger = logger.child({ component: "RedisClient" });

redisClient.on("connect", () => {
  redisLogger.info("redis.connecting", getConnectionLogData());
});

redisClient.on("ready", () => {
  redisLogger.info("redis.ready", getConnectionLogData());
});

redisClient.on("error", (error) => {
  redisLogger.error("redis.error", { ...getConnectionLogData(), error });
});

export async function verifyRedisConnection(loggerInstance: ILogger = redisLogger): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.REDIS_VERIFY_TIMEOUT_MS) || 10000;
  loggerInstance.info("redis.connection.verify.requested", { ...getConnectionLogData(), timeoutMs });

  const response = await withTimeout(redisClient.ping(), timeoutMs);

  loggerInstance.info("redis.connection.verify.succeeded", {
    ...getConnectionLogData(),
    response,
    durationMs: Date.now() - startedAt
  });
}

function getConnectionLogData(): Record<string, unknown> {
  return {
    host: connection.host,
    port: connection.port,
    tls: useTls
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Redis verification timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

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

    const result = await redisClient.set(lockKey, "1", "EX", 10, "NX");

    return result === "OK";
  }

  async releaseLock(clientId: number, businessId: number): Promise<void> {
    const lockKey = `lock:${clientId}:${businessId}`;
    await redisClient.del(lockKey);
  }
}

