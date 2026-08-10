import { describe, expect, it, vi } from "vitest";
import { NullLogger } from "../../src/logging/logger";
import { RealtimeService } from "../../src/Realtime/RealtimeService";
import { IRealtimePublisher } from "../../src/Realtime/realtimeTypes";

function createPublisher(): IRealtimePublisher & { publish: ReturnType<typeof vi.fn> } {
  return {
    publish: vi.fn().mockResolvedValue(2)
  };
}

const message = {
  id: 42,
  conversationId: 7,
  type: "user" as const,
  content: "Hello",
  status: "received",
  createdAt: "2026-08-01T09:00:00.000Z"
};

describe("RealtimeService", () => {
  it("publishes a versioned message-created event to the conversation channel", async () => {
    const publisher = createPublisher();
    const service = new RealtimeService(publisher, new NullLogger());

    const event = await service.publishMessageCreated(3, message);

    expect(publisher.publish).toHaveBeenCalledOnce();
    const [channel, payload] = publisher.publish.mock.calls[0];
    expect(channel).toBe("realtime:conversation:7");
    expect(JSON.parse(payload)).toEqual(event);
    expect(event).toMatchObject({
      event: "message.created",
      version: 1,
      businessId: 3,
      conversationId: 7,
      message
    });
    expect(event.eventId).toEqual(expect.any(String));
    expect(event.occurredAt).toEqual(expect.any(String));
  });

  it("propagates publisher failures", async () => {
    const publisher = createPublisher();
    const failure = new Error("Redis unavailable");
    publisher.publish.mockRejectedValue(failure);
    const service = new RealtimeService(publisher, new NullLogger());

    await expect(service.publishMessageCreated(3, message)).rejects.toBe(failure);
  });

  it("builds deterministic conversation channel names", () => {
    expect(RealtimeService.conversationChannel(123)).toBe("realtime:conversation:123");
  });
});
