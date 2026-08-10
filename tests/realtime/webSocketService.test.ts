import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { NullLogger } from "../../src/logging/logger";
import { WebSocketService } from "../../src/Realtime/WebSocketService";
import {
  IRealtimeSubscriber,
  RealtimeEvent,
  RealtimeEventHandler
} from "../../src/Realtime/realtimeTypes";

class FakeRealtimeSubscriber implements IRealtimeSubscriber {
  handlers = new Map<number, Set<RealtimeEventHandler>>();
  close = vi.fn(async () => undefined);

  async subscribeToConversation(
    conversationId: number,
    handler: RealtimeEventHandler
  ): Promise<() => Promise<void>> {
    const handlers = this.handlers.get(conversationId) ?? new Set();
    handlers.add(handler);
    this.handlers.set(conversationId, handlers);
    return async () => {
      handlers.delete(handler);
      if (!handlers.size) this.handlers.delete(conversationId);
    };
  }

  emit(conversationId: number, event: RealtimeEvent): void {
    for (const handler of this.handlers.get(conversationId) ?? []) void handler(event);
  }
}

type Harness = {
  server: Server;
  service: WebSocketService;
  subscriber: FakeRealtimeSubscriber;
  url: string;
};

const harnesses: Harness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map(async ({ service, server }) => {
    await service.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }));
});

describe("WebSocketService", () => {
  it("authenticates, subscribes, and forwards realtime events", async () => {
    const harness = await createHarness(async (businessId, conversationId) => (
      businessId === 3 && conversationId === 7
    ));
    const socket = await connect(harness.url);

    expect(await sendAndReceive(socket, { type: "authenticate", token: "valid" })).toMatchObject({
      type: "authenticated",
      userId: 11
    });
    expect(await sendAndReceive(socket, {
      type: "subscribe",
      businessId: 3,
      conversationId: 7
    })).toMatchObject({ type: "subscribed", businessId: 3, conversationId: 7 });

    const incoming = nextMessage(socket);
    harness.subscriber.emit(7, messageCreatedEvent);

    expect(await incoming).toEqual({ type: "event", event: messageCreatedEvent });
    socket.close();
  });

  it("rejects subscriptions outside the authenticated user's businesses", async () => {
    const accessCheck = vi.fn(async () => true);
    const harness = await createHarness(accessCheck);
    const socket = await connect(harness.url);
    await sendAndReceive(socket, { type: "authenticate", token: "valid" });

    expect(await sendAndReceive(socket, {
      type: "subscribe",
      businessId: 99,
      conversationId: 7
    })).toMatchObject({ type: "error", code: "FORBIDDEN" });
    expect(accessCheck).not.toHaveBeenCalled();
    socket.close();
  });

  it("rejects a conversation that does not belong to the requested business", async () => {
    const harness = await createHarness(async () => false);
    const socket = await connect(harness.url);
    await sendAndReceive(socket, { type: "authenticate", token: "valid" });

    expect(await sendAndReceive(socket, {
      type: "subscribe",
      businessId: 3,
      conversationId: 404
    })).toMatchObject({ type: "error", code: "NOT_FOUND" });
    expect(harness.subscriber.handlers.size).toBe(0);
    socket.close();
  });

  it("requires authentication before subscribing", async () => {
    const harness = await createHarness(async () => true);
    const socket = await connect(harness.url);

    expect(await sendAndReceive(socket, {
      type: "subscribe",
      businessId: 3,
      conversationId: 7
    })).toMatchObject({ type: "error", code: "UNAUTHORIZED" });
    socket.close();
  });
});

async function createHarness(
  accessCheck: (businessId: number, conversationId: number) => Promise<boolean>
): Promise<Harness> {
  const server = createServer();
  const subscriber = new FakeRealtimeSubscriber();
  const service = new WebSocketService(server, subscriber, accessCheck, new NullLogger(), {
    authenticationTimeoutMs: 1_000,
    heartbeatIntervalMs: 60_000,
    verifyToken: (token) => {
      if (token !== "valid") throw new Error("Invalid token");
      return {
        userId: 11,
        email: "agent@example.com",
        platformRole: "user",
        businessIds: [3],
        businessMemberships: [{ businessId: 3, role: "member" }]
      };
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const harness = { server, service, subscriber, url: `ws://127.0.0.1:${address.port}/v1/realtime` };
  harnesses.push(harness);
  return harness;
}

async function connect(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}

async function sendAndReceive(socket: WebSocket, command: unknown): Promise<Record<string, unknown>> {
  const response = nextMessage(socket);
  socket.send(JSON.stringify(command));
  return response;
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
    socket.once("error", reject);
  });
}

const messageCreatedEvent: RealtimeEvent = {
  eventId: "event-1",
  event: "message.created",
  version: 1,
  occurredAt: "2026-08-02T09:00:00.000Z",
  businessId: 3,
  conversationId: 7,
  message: {
    id: 42,
    conversationId: 7,
    type: "user",
    content: "Hello",
    status: "received",
    createdAt: "2026-08-02T09:00:00.000Z"
  }
};
