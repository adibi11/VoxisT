import "dotenv/config";
import { Job, Worker } from "bullmq";
import { connection } from "../dataClients/CacheClient/redis";
import { JobData } from "../dataClients/Types/apiTypes";
import { Message } from "../dataClients/Types/apiTypes";
import { MessageService } from "../MessageService/messageService";
import { RedisCacheManager } from "../dataClients/CacheClient/redis";
import { SqlManager } from "../dataClients/SqlClient/SqlManager";
import { OpenAIApi } from "../llm/openaiApi";


const openAiApi = new OpenAIApi();
const cacheManager = new RedisCacheManager();
const sqlInterface = new SqlManager(); // Assuming you have a SqlManager implementation
const messageService = new MessageService(cacheManager, sqlInterface,openAiApi);




const worker = new Worker(
  "message-queue",
  async (job) => {
    console.log("Processing job:", job.data.event);

    const  message  = job.data as JobData;

    // simulate processing
    try {
        await messageService.processMessage(message.event);
    } catch (error) {
        throw error; // rethrow to trigger retry
    }

    
    
  },
  {
    connection
  }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.log(`Job ${job?.id} failed:`, err.message);
});