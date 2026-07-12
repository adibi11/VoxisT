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
import { RegisterBusinessUserRequestDto, LoginRequestDto} from "../contracts";
import cors from "cors";
import version from "../../versions/api.json";

//IMPORT ROUTES
import { getBusinessContextRoutes } from "./routes/businesContextRoutes";
import { getAuthRoutes } from "./routes/authRoutes";
import { getBusinessRoutes } from "./routes/businessRoutes";
import { getClientRoutes } from "./routes/clientRoutes";
import { getConversationRoutes } from "./routes/conversationRoutes";
import { getLeadRoutes } from "./routes/leadRoutes";
import { getFollowUpRoutes } from "./routes/followUpRoutes";

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
  allowedHeaders: ["Content-Type", "Authorization", "x-lead-capture-key"],
  credentials: false,
  optionsSuccessStatus: 204
});

app.use(corsMiddleware);
app.options(/.*/, corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
getBusinessContextRoutes(app, sqlManager, appLogger);
getAuthRoutes(app, sqlManager, appLogger);
getBusinessRoutes(app, sqlManager, appLogger);
getClientRoutes(app, sqlManager, appLogger);
getConversationRoutes(app, sqlManager, appLogger);
getLeadRoutes(app, sqlManager, appLogger);
getFollowUpRoutes(app, sqlManager, appLogger);


app.post("/webhook/:id", async (req, res) => {
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
      data: event,
      businessId: Number(req.params.id)
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




function getAllowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3001,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
