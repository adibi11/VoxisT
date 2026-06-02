import "dotenv/config";
import express from "express";
import { QueueManager } from "../QueueClient/queue";
import { CommunicationChannel, JobData,ActionType, MessageProvider } from "../dataClients/Types/apiTypes";
import { twillioMessage } from "../dataClients/Types/apiTypes";
import { BusinessDto } from "../dataClients/Types/apiTypes";
import { SqlManager } from "../dataClients/SqlClient/SqlManager";
import { logger } from "../logging/logger";
import { MESSAGE_QUEUE_NAME } from "../QueueClient/queueNames";

const appLogger = logger.child({ component: "ApiServer" });
const sqlManager = new SqlManager(logger.child({ component: "SqlManager" }));
const queueManager = new QueueManager(MESSAGE_QUEUE_NAME, logger.child({ component: "QueueManager", queueName: MESSAGE_QUEUE_NAME }));
const app = express();
const PORT = 3000;

app.use(express.json());

app.post("/webhook", async (req, res) => {
  const event = req.body as twillioMessage;
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
  if(!event) {
    return res.status(400).send("Invalid event data");
  }
  
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
