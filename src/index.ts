import express from "express";
import { QueueManager } from "./QueueManager/queue";
import { JobData,ActionType } from "./dataClients/Types/apiTypes";
import { twillioMessage } from "./dataClients/Types/apiTypes";
import { BusinessDto } from "./dataClients/Types/apiTypes";
import { SqlManager } from "./dataClients/SqlClient/SqlManager";

const sqlManager = new SqlManager();
const queueManager = new QueueManager("message-queue");
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
      data: event
    }
   };
  console.log("Received event:", jobData);
  if(!event) {
    return res.status(400).send("Invalid event data");
  }
  
     queueManager.queue.add("event", 
      jobData ,
      { attempts: 3, backoff: {delay : 1000, type: 'exponential'} } );
  

  return res.status(200).json({ message: "Event received successfully"}); });
  
app.post("/business",async (req, res) => {
  try {
    const businessDto = req.body as BusinessDto;  
    await sqlManager.createDbBusiness(businessDto);
    return res.status(201).json({ message: "Business created successfully" });
  }
  catch (error) {
    console.error("Error creating business:", error);
    return res.status(500).json({ message: "Failed to create business" });
  }});
    

  

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});