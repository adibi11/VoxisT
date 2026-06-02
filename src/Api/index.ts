import "dotenv/config";
import express from "express";
import { QueueManager } from "../QueueClient/queue";
import { CommunicationChannel, JobData,ActionType, MessageProvider } from "../dataClients/Types/apiTypes";
import { twillioMessage } from "../dataClients/Types/apiTypes";
import { BusinessDto } from "../dataClients/Types/apiTypes";
import { SqlManager } from "../dataClients/SqlClient/SqlManager";
import { logger } from "../logging/logger";
import { MESSAGE_QUEUE_NAME } from "../QueueClient/queueNames";
import { hashPassword, verifyPassword } from "../auth/password";
import { signJwt } from "../auth/jwt";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess } from "./authMiddleware";
import { LoginRequestDto, RegisterBusinessUserRequestDto } from "../contracts";

const appLogger = logger.child({ component: "ApiServer" });
const sqlManager = new SqlManager(logger.child({ component: "SqlManager" }));
const queueManager = new QueueManager(MESSAGE_QUEUE_NAME, logger.child({ component: "QueueManager", queueName: MESSAGE_QUEUE_NAME }));
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.post("/auth/register", async (req, res) => {
  try {
    const request = req.body as RegisterBusinessUserRequestDto;
    if (!request.email || !request.password || !request.businessId) {
      return res.status(400).json({ message: "email, password and businessId are required" });
    }

    const user = await sqlManager.createBusinessUser(
      request.email,
      hashPassword(request.password),
      request.displayName,
      request.businessId
    );
    const token = signJwt({
      userId: user.id,
      email: user.email,
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
      businessIds: user.businessIds
    });
    const { passwordHash: _passwordHash, ...safeUser } = user;

    return res.status(200).json({ token, user: safeUser });
  } catch (error) {
    appLogger.error("auth.login.failed", { error });
    return res.status(500).json({ message: "Failed to login" });
  }
});

app.get("/me/businesses", requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    return res.status(200).json(await sqlManager.getBusinessesForUser(authReq.auth.userId));
  } catch (error) {
    appLogger.error("businesses.list.failed", { error });
    return res.status(500).json({ message: "Failed to fetch businesses" });
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

    return res.status(200).json(await sqlManager.getClientsByBusiness(businessId));
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

    return res.status(200).json(await sqlManager.getConversationsByBusinessAndClient(businessId, clientId));
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
      type: ActionType.HandleMessage,
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
    

  

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(PORT, () => {
  appLogger.info("server.started", { port: PORT });
});

function getTwilioChannel(event: twillioMessage): CommunicationChannel {
  if (event.From?.startsWith("whatsapp:") || event.To?.startsWith("whatsapp:")) {
    return CommunicationChannel.Whatsapp;
  }

  return CommunicationChannel.Whatsapp;
}

function isValidTwilioMessage(event: Partial<twillioMessage> | undefined): event is twillioMessage {
  return Boolean(event?.From && event?.To && event?.Body);
}
