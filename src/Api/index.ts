import "dotenv/config";
import express from "express";
import { QueueManager } from "../QueueClient/queue";
import { verifyRedisConnection } from "../dataClients/CacheClient/redis";
import { CommunicationChannel, JobData,ApiActionType, MessageProvider } from "../dataClients/Types/apiTypes";
import { twillioMessage } from "../dataClients/Types/apiTypes";
import { BusinessDto } from "../dataClients/Types/apiTypes";
import { SqlManager } from "../dataClients/SqlClient/SqlManager";
import { logger } from "../logging/logger";
import { MESSAGE_QUEUE_NAME } from "../QueueClient/queueNames";
import { hashPassword, verifyPassword } from "../auth/password";
import { signJwt } from "../auth/jwt";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess, requirePlatformAdmin } from "./authMiddleware";
import { LoginRequestDto, RegisterBusinessUserRequestDto, UpsertBusinessContextRequestDto } from "../contracts";
import cors from "cors";
import version from "../../versions/api.json";

const appLogger = logger.child({ component: "ApiServer" });
const sqlManager = new SqlManager(logger.child({ component: "SqlManager" }));
const queueManager = new QueueManager(MESSAGE_QUEUE_NAME, logger.child({ component: "QueueManager", queueName: MESSAGE_QUEUE_NAME }));
const app = express();
const PORT = 3000;
const API_VERSION = version.version || "1.0.0";

const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || getAllowedOrigins().includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin denied: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  optionsSuccessStatus: 204
});

app.use(corsMiddleware);
app.options(/.*/, corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.post("/auth/register", async (req, res) => {
  try {
    const request = req.body as RegisterBusinessUserRequestDto;
    if (!request.email || !request.password || !request.business?.name || !request.business?.phone || !request.business?.email) {
      return res.status(400).json({ message: "email, password and business details are required" });
    }

    const user = await sqlManager.registerBusinessOwner(
      request.email,
      hashPassword(request.password),
      request.displayName,
      request.business,
      isValidPlatformRole(request.platformRole) ? request.platformRole : "user"
    );
    const token = signJwt({
      userId: user.id,
      email: user.email,
      platformRole: user.platformRole,
      businessIds: user.businessIds,
      businessMemberships: user.businessMemberships
    });

    appLogger.info("auth.register.succeeded", {
      userId: user.id,
      email: user.email,
      platformRole: user.platformRole,
      businessIds: user.businessIds
    });

    return res.status(201).json({ token, user });
  } catch (error) {
    appLogger.error("auth.register.failed", { error });
    return res.status(500).json({ message: "Failed to register user" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const request = req.body as LoginRequestDto;
    if (!request.email || !request.password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const user = await sqlManager.getUserWithPasswordByEmail(request.email);
    if (!user || !verifyPassword(request.password, user.passwordHash)) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = signJwt({
      userId: user.id,
      email: user.email,
      platformRole: user.platformRole,
      businessIds: user.businessIds,
      businessMemberships: user.businessMemberships
    });
    const { passwordHash: _passwordHash, ...safeUser } = user;

    appLogger.info("auth.login.succeeded", {
      userId: user.id,
      email: user.email,
      platformRole: user.platformRole,
      businessIds: user.businessIds
    });

    return res.status(200).json({ token, user: safeUser });
  } catch (error) {
    appLogger.error("auth.login.failed", { error });
    return res.status(500).json({ message: "Failed to login" });
  }
});

app.get("/me/businesses", requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const businesses = await sqlManager.getBusinessesForUser(authReq.auth.userId);
    appLogger.info("businesses.list.succeeded", {
      userId: authReq.auth.userId,
      count: businesses.length
    });
    return res.status(200).json(businesses);
  } catch (error) {
    appLogger.error("businesses.list.failed", { error });
    return res.status(500).json({ message: "Failed to fetch businesses" });
  }
});

app.get("/admin/businesses", requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requirePlatformAdmin(authReq, res)) {
      return;
    }

    const businesses = await sqlManager.getAllBusinesses();
    appLogger.info("admin.businesses.list.succeeded", {
      userId: authReq.auth.userId,
      count: businesses.length
    });
    return res.status(200).json(businesses);
  } catch (error) {
    appLogger.error("admin.businesses.list.failed", { error });
    return res.status(500).json({ message: "Failed to fetch businesses" });
  }
});

app.put("/businesses/:businessId/context", requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const businessId = Number(req.params.businessId);
    if (!Number.isFinite(businessId)) {
      return res.status(400).json({ message: "Invalid businessId" });
    }
    if (!requireBusinessAccess(authReq, res, businessId)) {
      return;
    }

    const request = req.body as UpsertBusinessContextRequestDto;
    if (!isValidBusinessContextRequest(request)) {
      return res.status(400).json({ message: "Invalid business context" });
    }

    const context = await sqlManager.upsertBusinessContext({
      businessId,
      businessProfile: request.businessProfile,
      description: request.description,
      serviceCatalog: request.serviceCatalog,
      conversationPolicy: request.conversationPolicy,
      knownClientContext: request.knownClientContext
    });

    appLogger.info("business.context.upsert.succeeded", {
      userId: authReq.auth.userId,
      businessId
    });

    return res.status(200).json(context);
  } catch (error) {
    appLogger.error("business.context.upsert.failed", { error });
    return res.status(500).json({ message: "Failed to save business context" });
  }
});

app.get("/businesses/:businessId/context", requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const businessId = Number(req.params.businessId);
    if (!Number.isFinite(businessId)) {
      return res.status(400).json({ message: "Invalid businessId" });
    }
    if (!requireBusinessAccess(authReq, res, businessId)) {
      return;
    }

    const context = await sqlManager.getBusinessContext(businessId);
    if (!context) {
      return res.status(404).json({ message: "Business context not found" });
    }

    appLogger.info("business.context.fetch.succeeded", {
      userId: authReq.auth.userId,
      businessId
    });

    return res.status(200).json(context);
  } catch (error) {
    appLogger.error("business.context.fetch.failed", { error });
    return res.status(500).json({ message: "Failed to fetch business context" });
  }
});

app.get("/businesses/:businessId/clients", requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const businessId = Number(req.params.businessId);
    if (!Number.isFinite(businessId)) {
      return res.status(400).json({ message: "Invalid businessId" });
    }
    if (!requireBusinessAccess(authReq, res, businessId)) {
      return;
    }

    const clients = await sqlManager.getClientsByBusiness(businessId);
    appLogger.info("clients.list.succeeded", {
      userId: authReq.auth.userId,
      businessId,
      count: clients.length
    });
    return res.status(200).json(clients);
  } catch (error) {
    appLogger.error("clients.list.failed", { error });
    return res.status(500).json({ message: "Failed to fetch clients" });
  }
});

app.get("/businesses/:businessId/conversations", requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const businessId = Number(req.params.businessId);
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
    if (!Number.isFinite(businessId) || (clientId !== undefined && !Number.isFinite(clientId))) {
      return res.status(400).json({ message: "Invalid businessId or clientId" });
    }
    if (!requireBusinessAccess(authReq, res, businessId)) {
      return;
    }

    const conversations = await sqlManager.getConversationsByBusinessAndClient(businessId, clientId);
    appLogger.info("conversations.list.succeeded", {
      userId: authReq.auth.userId,
      businessId,
      clientId,
      count: conversations.length
    });
    return res.status(200).json(conversations);
  } catch (error) {
    appLogger.error("conversations.list.failed", { error });
    return res.status(500).json({ message: "Failed to fetch conversations" });
  }
});

app.get("/businesses/:businessId/conversations/:conversationId/messages", requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const businessId = Number(req.params.businessId);
    const conversationId = Number(req.params.conversationId);
    if (!Number.isFinite(businessId) || !Number.isFinite(conversationId)) {
      return res.status(400).json({ message: "Invalid businessId or conversationId" });
    }
    if (!requireBusinessAccess(authReq, res, businessId)) {
      return;
    }

    const result = await sqlManager.getMessagesByConversation(businessId, conversationId);
    if (!result) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    appLogger.info("conversation.messages.succeeded", {
      userId: authReq.auth.userId,
      businessId,
      conversationId,
      messageCount: result.messages.length,
      paramsCount: result.params.length
    });

    return res.status(200).json(result);
  } catch (error) {
    appLogger.error("conversation.messages.failed", { error });
    return res.status(500).json({ message: "Failed to fetch messages" });
  }
});

app.post("/webhook", async (req, res) => {
  const event = req.body as twillioMessage;
  appLogger.info("webhook.raw.received", {
    contentType: req.headers["content-type"],
    hasBody: Boolean(req.body),
    keys: req.body ? Object.keys(req.body) : []
  });

  if(!isValidTwilioMessage(event)) {
    appLogger.warn("webhook.message.invalid", {
      contentType: req.headers["content-type"],
      body: req.body
    });
    return res.status(400).send("Invalid event data");
  }

  const jobData: JobData = {
    event: {
      type: ApiActionType.HandleMessage,
      content: event.Body,
      status: "received",
      channel: getTwilioChannel(event),
      provider: MessageProvider.Twilio,
      data: event
    }
   };
  appLogger.info("webhook.message.received", {
    from: event.From,
    to: event.To,
    channel: jobData.event.channel,
    provider: jobData.event.provider,
    bodyLength: event.Body?.length,
    actionType: jobData.event.type
  });
  
     await queueManager.addEvent(jobData);
  

  return res.status(200).json({ message: "Event received successfully"}); });
  
app.post("/business",async (req, res) => {
  try {
    const businessDto = req.body as BusinessDto;  
    await sqlManager.createDbBusiness(businessDto);
    return res.status(201).json({ message: "Business created successfully" });
  }
  catch (error) {
    appLogger.error("business.create.failed", { error });
    return res.status(500).json({ message: "Failed to create business" });
  }});
    

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" ,
    timestamp: new Date().toISOString(),
    version: API_VERSION});
    
  });
  


app.get("/", (req, res) => {
  res.send("Server is running");
});

startServer().catch((error) => {
  appLogger.error("server.startup.failed", { error });
  process.exit(1);
});

async function startServer(): Promise<void> {
  await verifyRedisConnection(appLogger);
  await queueManager.queue.waitUntilReady();
  appLogger.info("queue.connection.verify.succeeded", { queueName: MESSAGE_QUEUE_NAME });

  app.listen(PORT, () => {
    appLogger.info("server.started", { port: PORT });
  });
}

function getTwilioChannel(event: twillioMessage): CommunicationChannel {
  if (event.From?.startsWith("whatsapp:") || event.To?.startsWith("whatsapp:")) {
    return CommunicationChannel.Whatsapp;
  }

  return CommunicationChannel.Whatsapp;
}

function isValidTwilioMessage(event: Partial<twillioMessage> | undefined): event is twillioMessage {
  return Boolean(event?.From && event?.To && event?.Body);
}

function isValidBusinessContextRequest(request: Partial<UpsertBusinessContextRequestDto> | undefined): request is UpsertBusinessContextRequestDto {
  return Boolean(
    request?.businessProfile?.name &&
    request.businessProfile.language &&
    request.businessProfile.tone &&
    request.serviceCatalog !== undefined &&
    request.conversationPolicy !== undefined
  );
}

function isValidPlatformRole(role: unknown): role is "admin" | "user" {
  return role === "admin" || role === "user";
}

function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
