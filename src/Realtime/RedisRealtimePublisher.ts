import { redisClient } from "../dataClients/CacheClient/redis";
import { IRealtimePublisher } from "./realtimeTypes";

export class RedisRealtimePublisher implements IRealtimePublisher {
  publish(channel: string, payload: string): Promise<number> {
    return redisClient.publish(channel, payload);
  }
}
