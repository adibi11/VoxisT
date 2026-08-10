import { describe, expect, it, vi } from "vitest";
import { Redis } from "ioredis";
import { NullLogger } from "../../src/logging/logger";
import { RedisRealtimeSubscriber } from "../../src/Realtime/RedisRealtimeSubscriber";

function createRedisClient(): Redis {
  const client = new Redis({ lazyConnect: true });
  vi.spyOn(client, "subscribe").mockResolvedValue(1);
  vi.spyOn(client, "unsubscribe").mockResolvedValue(0);
  vi.spyOn(client, "quit").mockResolvedValue("OK");
  return client;
}

function emitMessage(client: Redis, channel: string, payload: unknown): void {
  client.emit("message", channel, typeof payload === "string" ? payload : JSON.stringify(payload));
}

const event = {
  eventId: "event-1",
  event: "message.created",
  version: 1,
  occurredAt: "2026-08-01T09:00:00.000Z",
  businessId: 3,
  conversationId: 7,
  message: {
    id: 42,
    conversationId: 7,
    type: "user",
    content: "Hello",
    status: "received",
    createdAt: "2026-08-01T09:00:00.000Z"
  }
};

describe("RedisRealtimeSubscriber", () => {
  it("subscribes once and fans events out to all conversation handlers", async () => {
    const client = createRedisClient();
    const subscriber = new RedisRealtimeSubscriber(client, new NullLogger());
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    await subscriber.subscribeToConversation(7, firstHandler);
    await subscriber.subscribeToConversation(7, secondHandler);
    emitMessage(client, "realtime:conversation:7", event);

    expect(client.subscribe).toHaveBeenCalledOnce();
    expect(client.subscribe).toHaveBeenCalledWith("realtime:conversation:7");
    expect(firstHandler).toHaveBeenCalledWith(event);
    expect(secondHandler).toHaveBeenCalledWith(event);
  });

  it("unsubscribes from Redis only after the final handler is removed", async () => {
    const client = createRedisClient();
    const subscriber = new RedisRealtimeSubscriber(client, new NullLogger());
    const stopFirst = await subscriber.subscribeToConversation(7, vi.fn());
    const stopSecond = await subscriber.subscribeToConversation(7, vi.fn());

    await stopFirst();
    expect(client.unsubscribe).not.toHaveBeenCalled();

    await stopSecond();
    expect(client.unsubscribe).toHaveBeenCalledOnce();
    expect(client.unsubscribe).toHaveBeenCalledWith("realtime:conversation:7");
  });

  it("ignores malformed and mismatched events", async () => {
    const client = createRedisClient();
    const subscriber = new RedisRealtimeSubscriber(client, new NullLogger());
    const handler = vi.fn();
    await subscriber.subscribeToConversation(7, handler);

    emitMessage(client, "realtime:conversation:7", "not-json");
    emitMessage(client, "realtime:conversation:7", { ...event, conversationId: 8 });

    expect(handler).not.toHaveBeenCalled();
  });

  it("closes its dedicated Redis connection and rejects new subscriptions", async () => {
    const client = createRedisClient();
    const subscriber = new RedisRealtimeSubscriber(client, new NullLogger());

    await subscriber.close();

    expect(client.quit).toHaveBeenCalledOnce();
    await expect(subscriber.subscribeToConversation(7, vi.fn())).rejects.toThrow(
      "Realtime subscriber is closed"
    );
  });
});
