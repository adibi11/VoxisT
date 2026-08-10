import { Redis } from "ioredis";
import { connection } from "../dataClients/CacheClient/redisConnection";
import { ILogger, logger } from "../logging/logger";
import { RealtimeService } from "./RealtimeService";
import {
  IRealtimeSubscriber,
  MESSAGE_CREATED_EVENT,
  RealtimeEvent,
  RealtimeEventHandler,
  REALTIME_EVENT_VERSION
} from "./realtimeTypes";

export class RedisRealtimeSubscriber implements IRealtimeSubscriber {
  private readonly handlers = new Map<string, Set<RealtimeEventHandler>>();
  private readonly logger: ILogger;
  private closed = false;

  constructor(
    private readonly client: Redis,
    loggerInstance: ILogger = logger.child({ component: "RedisRealtimeSubscriber" })
  ) {
    this.logger = loggerInstance;
    //Redis actively listens for messages on subscribed channels, so we set up a single listener for all messages and dispatch them to the appropriate handlers.
    this.client.on("message", this.handleMessage);
    this.client.on("error", this.handleRedisError);
  }

  async subscribeToConversation(
    conversationId: number,
    handler: RealtimeEventHandler
  ): Promise<() => Promise<void>> {
    if (this.closed) {
      throw new Error("Realtime subscriber is closed");
    }

    const channel = RealtimeService.conversationChannel(conversationId);
    let channelHandlers = this.handlers.get(channel);

    if (!channelHandlers) {
      channelHandlers = new Set();
      this.handlers.set(channel, channelHandlers);
      try {
        await this.client.subscribe(channel);
      } catch (error) {
        this.handlers.delete(channel);
        throw error;
      }
      this.logger.info("realtime.conversation.subscribed", { conversationId, channel });
    }

    channelHandlers.add(handler);
    let active = true;

    return async () => {
      if (!active) return;
      active = false;
      await this.removeHandler(channel, conversationId, handler);
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.handlers.clear();
    this.client.off("message", this.handleMessage);
    this.client.off("error", this.handleRedisError);
    await this.client.quit();
    this.logger.info("realtime.subscriber.closed");
  }
  // The handleMessage method is responsible for dispatching incoming messages to the appropriate handlers based on the channel they were received on. 
  // It first checks if there are any handlers registered for the channel. If there are, it attempts to parse the payload as a RealtimeEvent. 
  // If the payload is valid, it invokes each handler with the event. 
  // If any handler throws an error, it logs the error but continues to invoke the remaining handlers.
  private readonly handleMessage = (channel: string, payload: string): void => {
    const channelHandlers = this.handlers.get(channel);
    if (!channelHandlers?.size) return;

    let event: RealtimeEvent;
    try {
      event = JSON.parse(payload) as RealtimeEvent;
      if (!isRealtimeEvent(event)) {
        throw new Error("Unsupported realtime event payload");
      }
    } catch (error) {
      this.logger.warn("realtime.event.invalid", { channel, error });
      return;
    }

    for (const handler of channelHandlers) {
      Promise.resolve(handler(event)).catch((error) => {
        this.logger.error("realtime.event.handler_failed", {
          channel,
          eventId: event.eventId,
          error
        });
      });
    }
  };

  private readonly handleRedisError = (error: Error): void => {
    this.logger.error("realtime.subscriber.redis_error", { error });
  };

  private async removeHandler(
    channel: string,
    conversationId: number,
    handler: RealtimeEventHandler
  ): Promise<void> {
    const channelHandlers = this.handlers.get(channel);
    if (!channelHandlers) return;

    channelHandlers.delete(handler);
    if (channelHandlers.size > 0) return;

    this.handlers.delete(channel);
    await this.client.unsubscribe(channel);
    this.logger.info("realtime.conversation.unsubscribed", { conversationId, channel });
  }
}

export function createRedisRealtimeSubscriber(
  loggerInstance?: ILogger
): RedisRealtimeSubscriber {
  return new RedisRealtimeSubscriber(new Redis(connection), loggerInstance);
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<RealtimeEvent>;
  return event.event === MESSAGE_CREATED_EVENT
    && event.version === REALTIME_EVENT_VERSION
    && typeof event.eventId === "string"
    && typeof event.businessId === "number"
    && typeof event.conversationId === "number"
    && !!event.message
    && event.message.conversationId === event.conversationId;
}
