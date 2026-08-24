import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { QueueManager } from "../QueueClient/queue";
import { RedisCacheManager, verifyRedisConnection } from "../dataClients/CacheClient/redis";
import { CommunicationChannel, JobData,ApiActionType, MessageProvider } from "../dataClients/Types/apiTypes";
import { twillioMessage } from "../dataClients/Types/apiTypes";
import { BusinessDto } from "../dataClients/Types/apiTypes";
import { SqlManager } from "../dataClients/SqlClient/SqlManager";
import { logger } from "../logging/logger";
import { MESSAGE_QUEUE_NAME } from "../QueueClient/queueNames";
import { hashPassword, verifyPassword } from "../auth/password";
import { signJwt } from "../auth/jwt";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess, requirePlatformAdmin } from "./authMiddleware";
import { RegisterBusinessUserRequestDto, LoginRequestDto} from "../contracts";
import cors from "cors";
import version from "../../versions/api.json";

//IMPORT ROUTES
import { getBusinessContextRoutes } from "./routes/businesContextRoutes";
import { getAuthRoutes } from "./routes/authRoutes";
import { getBusinessRoutes } from "./routes/businessRoutes";
import { getBusinessParameterRoutes } from "./routes/businessParameterRoutes";
import { getClientRoutes } from "./routes/clientRoutes";
import { getConversationRoutes } from "./routes/conversationRoutes";
import { getLeadRoutes } from "./routes/leadRoutes";
import { getFollowUpRoutes } from "./routes/followUpRoutes";
import { getLeadIngestionRoutes } from "./routes/leadIngestionRoutes";
import { getIntegrationRoutes } from "./routes/integrationRoutes";
import { getTaskRoutes } from "./routes/taskRoutes";
import { getCaseRoutes } from "./routes/caseRoutes";
import { getDocumentBundleRoutes } from "./routes/documentBundleRoutes";
import { getDocumentRoutes } from "./routes/documentRoutes";
import { getPortalRoutes } from "./routes/portalRoutes";
import { getHumanTakeoverRoutes } from "./routes/humanTakeoverRoutes";
import { createBodyParserErrorHandler, createSecurityHeaders, getHttpSecurityConfig } from "./securityMiddleware";
import { createPublicEntrypointRateLimiter, createTaskEntrypointRateLimiter, getPublicEntrypointRateLimitConfig, getTaskEntrypointRateLimitConfig } from "./rateLimitMiddleware";
import { createMetaLeadAdsWebhookHandlers } from "../MetaLeadAds/metaLeadAdsWebhook";
import { getTwilioSignatureConfig, validateTwilioRequest } from "./twilioSignatureMiddleware";
import { createRedisRealtimeSubscriber } from "../Realtime/RedisRealtimeSubscriber";
import { WebSocketService } from "../Realtime/WebSocketService";
import { getInstagramCommentAutomationRoutes } from "../InstagramCommentAutomation/instagramRoutes";

const appLogger = logger.child({ component: "ApiServer" });
const sqlManager = new SqlManager(logger.child({ component: "SqlManager" }));
const queueManager = new QueueManager(MESSAGE_QUEUE_NAME, logger.child({ component: "QueueManager", queueName: MESSAGE_QUEUE_NAME }));
const cacheManager = new RedisCacheManager();
const app = express();
const httpServer = createServer(app);
const v1Router = express.Router();
const PORT = 3000;
const API_VERSION = version.version || "1.0.0";
const httpSecurityConfig = getHttpSecurityConfig();
const publicEntrypointRateLimitConfig = getPublicEntrypointRateLimitConfig();
const publicEntrypointRateLimiter = createPublicEntrypointRateLimiter(publicEntrypointRateLimitConfig, appLogger);
const taskEntrypointRateLimitConfig = getTaskEntrypointRateLimitConfig();
const taskEntrypointRateLimiter = createTaskEntrypointRateLimiter(taskEntrypointRateLimitConfig, appLogger);
const metaLeadAdsWebhook = createMetaLeadAdsWebhookHandlers(sqlManager, appLogger.child({ component: "MetaLeadAdsWebhook" }));
const twilioSignatureConfig = getTwilioSignatureConfig();
const realtimeSubscriber = createRedisRealtimeSubscriber(appLogger.child({ component: "RealtimeSubscriber" }));
const webSocketService = new WebSocketService(
  httpServer,
  realtimeSubscriber,
  async (businessId, conversationId) => Boolean(
    await sqlManager.getMessagesByConversation(businessId, conversationId)
  ),
  appLogger.child({ component: "WebSocketService" }),
  { allowedOrigins: getAllowedOrigins() }
);

const twilioSignatureLogger = appLogger.child({ component: "TwilioSignatureValidator" });

// Staging/production run immediately behind one ALB hop. Local development defaults to
// direct connections; set TRUST_PROXY_HOPS=1 only while testing through ngrok.
app.set("trust proxy", httpSecurityConfig.trustProxyHops);

const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || getAllowedOrigins().includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin denied: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-lead-capture-key", "X-Business-Id", "Idempotency-Key", "If-Match"],
  credentials: false,
  optionsSuccessStatus: 204
});

app.use(corsMiddleware);
app.options(/.*/, corsMiddleware);
app.use(createSecurityHeaders(httpSecurityConfig));
// Meta signatures cover the original bytes, so this route must parse its body before
// the global JSON middleware. It deliberately has no browser authentication.
app.use("/v1/webhooks/leads/meta", express.raw({ type: "application/json", limit: httpSecurityConfig.jsonBodyLimit }));
app.get("/v1/webhooks/leads/meta", metaLeadAdsWebhook.verify);
app.post("/v1/webhooks/leads/meta", metaLeadAdsWebhook.receive);
app.use(express.json({ limit: httpSecurityConfig.jsonBodyLimit }));
app.use(express.urlencoded({ extended: false, limit: httpSecurityConfig.formBodyLimit }));
getBusinessContextRoutes(v1Router, sqlManager, appLogger);
getAuthRoutes(v1Router, sqlManager, appLogger, publicEntrypointRateLimiter);
getBusinessRoutes(v1Router, sqlManager, appLogger);
getBusinessParameterRoutes(v1Router, sqlManager, appLogger);
getClientRoutes(v1Router, sqlManager, appLogger);
getConversationRoutes(v1Router, sqlManager, appLogger);
getLeadRoutes(v1Router, sqlManager, appLogger, publicEntrypointRateLimiter);
getFollowUpRoutes(v1Router, sqlManager, appLogger);
getLeadIngestionRoutes(v1Router, sqlManager, appLogger, publicEntrypointRateLimiter);
getIntegrationRoutes(v1Router, sqlManager, appLogger);
getInstagramCommentAutomationRoutes(v1Router, sqlManager, appLogger.child({ component: "InstagramCommentAutomation" }));
getTaskRoutes(v1Router, sqlManager, appLogger, taskEntrypointRateLimiter);
getDocumentBundleRoutes(v1Router, sqlManager, appLogger);
getCaseRoutes(v1Router, sqlManager, appLogger);
getDocumentRoutes(v1Router, sqlManager, appLogger);
getPortalRoutes(v1Router, sqlManager, appLogger, publicEntrypointRateLimiter);
getHumanTakeoverRoutes(v1Router, sqlManager, cacheManager, queueManager, appLogger);



// Business resolution is driven by the receiving number ("To"): the channel a
// number belongs to identifies both the business and the subaccount auth token
// that signs the request. The legacy /webhook/:id path stays as a fallback for
// numbers not yet onboarded as BusinessChannels.
async function handleTwilioWebhook(req: express.Request, res: express.Response) {
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

  let resolvedChannel = null;
  try {
    resolvedChannel = await sqlManager.businessChannelRepository.GetChannelForInbound(
      MessageProvider.Twilio,
      event.To
    );
  } catch (error) {
    appLogger.error("webhook.channel.resolve.failed", { to: event.To, error });
    return res.status(500).send("Failed to resolve channel");
  }

  // Twilio signs webhooks with the auth token of the (sub)account owning the
  // number, so validation must use the resolved channel's credentials.
  const signatureCheck = validateTwilioRequest(
    twilioSignatureConfig,
    twilioSignatureLogger,
    req,
    resolvedChannel?.credentials?.authToken
  );
  if (!signatureCheck.ok) {
    return res.status(403).send("Forbidden");
  }
  //Try to get the id from the path params as a fallback
  //The correct logic is to take it from the resolved integration
  const pathBusinessId = Number(req.params.id);
  const businessId = resolvedChannel?.channel.businessId
    ?? (Number.isInteger(pathBusinessId) && pathBusinessId > 0 ? pathBusinessId : undefined);
  if (!businessId) {
    appLogger.warn("webhook.business.unresolved", { to: event.To });
    return res.status(404).send("Unknown receiving number");
  }

  // Classify bot vs human lane here, once, before the message is ever
  // enqueued - a human-managed conversation must never reach the LLM/bot
  // pipeline, so MessageService doesn't have to re-derive this mid-pipeline.
  let actionType = ApiActionType.HandleMessage;
  try {
    const client = await sqlManager.getOrCreateClientByPhone(event.From);
    const humanManaged = await sqlManager.isConversationHumanManaged(client.id, businessId);
    if (humanManaged) {
      actionType = ApiActionType.ClientConversationMessage;
    }
  } catch (error) {
    appLogger.error("webhook.human_takeover.classify.failed", { from: event.From, businessId, error });
    return res.status(500).send("Failed to classify inbound message");
  }

  const jobData: JobData = {
    event: {
      type: actionType,
      content: event.Body,
      status: "received",
      channel: getTwilioChannel(event),
      provider: MessageProvider.Twilio,
      data: event,
      businessId
    }
   };
  appLogger.info("webhook.message.received", {
    from: event.From,
    to: event.To,
    channel: jobData.event.channel,
    provider: jobData.event.provider,
    businessId,
    resolvedByChannel: Boolean(resolvedChannel),
    bodyLength: event.Body?.length,
    actionType: jobData.event.type
  });

  await queueManager.addEvent(jobData);

  return res.status(200).json({ message: "Event received successfully"});
}

v1Router.post("/webhook", handleTwilioWebhook);
v1Router.post("/webhook/:id", handleTwilioWebhook);
  
/*app.post("/business",async (req, res) => {
  try {
    const businessDto = req.body as BusinessDto;  
    await sqlManager.createDbBusiness(businessDto);
    return res.status(201).json({ message: "Business created successfully" });
  }
  catch (error) {
    appLogger.error("business.create.failed", { error });
    return res.status(500).json({ message: "Failed to create business" });
  }});
    */

v1Router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" ,
    timestamp: new Date().toISOString(),
    version: API_VERSION});
    
  });

app.use("/v1", v1Router);
  


app.get("/", (req, res) => {
  res.send("Server is running");
});

// Body parsers run before routes, so their failures are handled centrally after route registration.
app.use(createBodyParserErrorHandler(appLogger));

startServer().catch((error) => {
  appLogger.error("server.startup.failed", { error });
  process.exit(1);
});

async function startServer(): Promise<void> {
  await verifyRedisConnection(appLogger);
  await queueManager.queue.waitUntilReady();
  appLogger.info("queue.connection.verify.succeeded", { queueName: MESSAGE_QUEUE_NAME });

  httpServer.listen(PORT, () => {
    appLogger.info("server.started", {
      port: PORT,
      trustProxyHops: httpSecurityConfig.trustProxyHops,
      jsonBodyLimit: httpSecurityConfig.jsonBodyLimit,
      formBodyLimit: httpSecurityConfig.formBodyLimit,
      publicEntrypointRateLimitMax: publicEntrypointRateLimitConfig.maxRequests,
      publicEntrypointRateLimitWindowSeconds: publicEntrypointRateLimitConfig.windowSeconds
    });
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




function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS || "http://localhost:3003,http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:8081,https://voxistudio.com,https://www.voxistudio.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

