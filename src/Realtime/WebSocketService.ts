import { IncomingMessage, Server as HttpServer } from "http";
import { Socket } from "net";
import { URL } from "url";
import { WebSocket, WebSocketServer } from "ws";
import { verifyJwt } from "../auth/jwt";
import { JwtClaimsDto } from "../contracts/authContracts";
import { ILogger, logger } from "../logging/logger";
import { IRealtimeSubscriber, RealtimeEvent } from "./realtimeTypes";

const DEFAULT_PATH = "/v1/realtime";
const DEFAULT_AUTH_TIMEOUT_MS = 5_000;
const DEFAULT_HEARTBEAT_MS = 30_000;

type ClientCommand =
  | { type: "authenticate"; token: string; requestId?: string }
  | { type: "subscribe"; businessId: number; conversationId: number; requestId?: string }
  | { type: "unsubscribe"; conversationId: number; requestId?: string };

type ConversationAccessChecker = (businessId: number, conversationId: number) => Promise<boolean>;
type TokenVerifier = (token: string) => JwtClaimsDto;

type ClientState = {
  claims?: JwtClaimsDto;
  alive: boolean;
  subscriptions: Map<number, { businessId: number; stop: () => Promise<void> }>;
};

export type WebSocketServiceOptions = {
  path?: string;
  allowedOrigins?: string[];
  authenticationTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  verifyToken?: TokenVerifier;
};

export class WebSocketService {
  private readonly wsServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  private readonly states = new Map<WebSocket, ClientState>();
  private readonly path: string;
  private readonly allowedOrigins: Set<string>;
  private readonly authenticationTimeoutMs: number;
  private readonly heartbeat: NodeJS.Timeout;
  private readonly verifyToken: TokenVerifier;
  private readonly logger: ILogger;
  private closed = false;

  constructor(
    private readonly httpServer: HttpServer,
    private readonly subscriber: IRealtimeSubscriber,
    private readonly canAccessConversation: ConversationAccessChecker,
    loggerInstance: ILogger = logger.child({ component: "WebSocketService" }),
    options: WebSocketServiceOptions = {}
  ) {
    this.logger = loggerInstance;
    this.path = options.path ?? DEFAULT_PATH;
    this.allowedOrigins = new Set(options.allowedOrigins ?? []);
    this.authenticationTimeoutMs = options.authenticationTimeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS;
    this.verifyToken = options.verifyToken ?? verifyJwt;

    this.httpServer.on("upgrade", this.handleUpgrade);
    //Each connection is handled in the handleUpgrade method, which will call handleConnection if the upgrade is successful.
    this.wsServer.on("connection", this.handleConnection);
    // Set up a heartbeat interval to check the health of the connections
    this.heartbeat = setInterval(
      () => this.checkConnections(),
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS
    );
    //Remove the heartbeat interval from the event loop if there are no active connections, allowing the process to exit gracefully.
    this.heartbeat.unref();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    this.httpServer.off("upgrade", this.handleUpgrade);
    // Clean up all active WebSocket connections and their subscriptions
    await Promise.all([...this.states.keys()].map((socket) => this.cleanupSocket(socket)));
    for (const socket of this.wsServer.clients) socket.terminate();
    await new Promise<void>((resolve) => this.wsServer.close(() => resolve()));
    await this.subscriber.close();
    this.logger.info("websocket.service.closed");
  }

  private readonly handleUpgrade = (request: IncomingMessage, socket: Socket, head: Buffer): void => {
    if (this.closed || !this.isExpectedPath(request) || !this.isAllowedOrigin(request)) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    this.wsServer.handleUpgrade(request, socket, head, (webSocket) => {
      this.wsServer.emit("connection", webSocket, request);
    });
  };

  // Handle a new WebSocket connection, initializing its state and setting up event listeners for messages, pings, and closure.
  private readonly handleConnection = (socket: WebSocket): void => {
    // Initialize the state for the new connection, including its alive status and subscriptions
    const state: ClientState = { alive: true, subscriptions: new Map() };
    this.states.set(socket, state);

    const authenticationTimer = setTimeout(() => {
      if (!state.claims) socket.close(4401, "Authentication required");
    }, this.authenticationTimeoutMs);
    authenticationTimer.unref();
    // Set up event listeners for the WebSocket connection
    socket.on("pong", () => { state.alive = true; });
    socket.on("message", (data, isBinary) => {
      void this.handleCommand(socket, data.toString(), isBinary).catch((error) => {
        this.logger.error("websocket.command.failed", { error });
        this.sendError(socket, "INTERNAL_ERROR", "Command failed");
      });
    });
    socket.once("close", () => {
      clearTimeout(authenticationTimer);
      void this.cleanupSocket(socket);
    });
    socket.once("error", (error) => this.logger.warn("websocket.connection.error", { error }));
  };

  // Handle incoming WebSocket commands from clients, such as authentication, subscription, and unsubscription.
  private async handleCommand(socket: WebSocket, raw: string, isBinary: boolean): Promise<void> {
    if (isBinary) {
      this.sendError(socket, "INVALID_COMMAND", "Binary messages are not supported");
      return;
    }

    const command = parseCommand(raw);
    if (!command) {
      this.sendError(socket, "INVALID_COMMAND", "Invalid WebSocket command");
      return;
    }

    const state = this.states.get(socket);
    if (!state) return;

    if (command.type === "authenticate") {
      if (state.claims) {
        this.sendError(socket, "INVALID_COMMAND", "Socket is already authenticated", command.requestId);
        return;
      }
      try {
        state.claims = this.verifyToken(command.token);
        this.send(socket, { type: "authenticated", userId: state.claims.userId, requestId: command.requestId });
      } catch {
        this.sendError(socket, "UNAUTHORIZED", "Invalid bearer token", command.requestId);
        socket.close(4401, "Invalid bearer token");
      }
      return;
    }

    if (!state.claims) {
      this.sendError(socket, "UNAUTHORIZED", "Authenticate before subscribing", command.requestId);
      return;
    }
    // Handle subscription and unsubscription commands
    if (command.type === "subscribe") {
      await this.subscribe(socket, state, command);
      return;
    }

    await this.unsubscribe(state, command.conversationId);
    this.send(socket, { type: "unsubscribed", conversationId: command.conversationId, requestId: command.requestId });
  }

  private async subscribe(
    socket: WebSocket,
    state: ClientState,
    command: Extract<ClientCommand, { type: "subscribe" }>
  ): Promise<void> {
    if (!canAccessBusiness(state.claims!, command.businessId)) {
      this.sendError(socket, "FORBIDDEN", "Business access denied", command.requestId);
      return;
    }
    if (!await this.canAccessConversation(command.businessId, command.conversationId)) {
      this.sendError(socket, "NOT_FOUND", "Conversation not found", command.requestId);
      return;
    }
    //Subscribe conversion to the websocket service, 
    // ensuring that the conversation is not already subscribed under a different business. 
    // If it is, an error is sent back to the client. 
    // If not, the subscription is created and stored in the client's state.
    const existing = state.subscriptions.get(command.conversationId);
    if (existing) {
      if (existing.businessId !== command.businessId) {
        this.sendError(socket, "INVALID_COMMAND", "Conversation already subscribed under another business", command.requestId);
        return;
      }
    } else {
      const stop = await this.subscriber.subscribeToConversation(command.conversationId, (event) => {
        if (event.businessId === command.businessId) this.sendEvent(socket, event);
      });
      state.subscriptions.set(command.conversationId, { businessId: command.businessId, stop });
    }

    this.send(socket, {
      type: "subscribed",
      businessId: command.businessId,
      conversationId: command.conversationId,
      requestId: command.requestId
    });
  }

  private async unsubscribe(state: ClientState, conversationId: number): Promise<void> {
    const subscription = state.subscriptions.get(conversationId);
    if (!subscription) return;
    state.subscriptions.delete(conversationId);
    await subscription.stop();
  }

  private async cleanupSocket(socket: WebSocket): Promise<void> {
    const state = this.states.get(socket);
    if (!state) return;
    this.states.delete(socket);
    await Promise.all([...state.subscriptions.values()].map(({ stop }) => stop().catch((error) => {
      this.logger.warn("websocket.unsubscribe.failed", { error });
    })));
  }

  private checkConnections(): void {
    for (const [socket, state] of this.states) {
      if (!state.alive) {
        socket.terminate();
        continue;
      }
      state.alive = false;
      socket.ping();
    }
  }

  private sendEvent(socket: WebSocket, event: RealtimeEvent): void {
    this.send(socket, { type: "event", event });
  }

  private sendError(socket: WebSocket, code: string, message: string, requestId?: string): void {
    this.send(socket, { type: "error", code, message, requestId });
  }

  private send(socket: WebSocket, payload: unknown): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }

  private isExpectedPath(request: IncomingMessage): boolean {
    try {
      return new URL(request.url ?? "", "http://localhost").pathname === this.path;
    } catch {
      return false;
    }
  }

  private isAllowedOrigin(request: IncomingMessage): boolean {
    const origin = request.headers.origin;
    return !origin || this.allowedOrigins.size === 0 || this.allowedOrigins.has(origin);
  }
}

function canAccessBusiness(claims: JwtClaimsDto, businessId: number): boolean {
  return claims.platformRole === "admin" || claims.businessIds.includes(businessId);
}

function parseCommand(raw: string): ClientCommand | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const requestId = typeof value.requestId === "string" ? value.requestId : undefined;
    if (value.type === "authenticate" && typeof value.token === "string" && value.token) {
      return { type: "authenticate", token: value.token, requestId };
    }
    if (value.type === "subscribe" && isPositiveInteger(value.businessId) && isPositiveInteger(value.conversationId)) {
      return { type: "subscribe", businessId: value.businessId, conversationId: value.conversationId, requestId };
    }
    if (value.type === "unsubscribe" && isPositiveInteger(value.conversationId)) {
      return { type: "unsubscribe", conversationId: value.conversationId, requestId };
    }
    return null;
  } catch {
    return null;
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
