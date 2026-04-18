import "dotenv/config";
import { Job, Worker } from "bullmq";
import { connection } from "../dataManager/CacheManager/redis";
import { JobData } from "../dataManager/Types/apiTypes";
import { Message } from "../dataManager/Types/apiTypes";
import { MessageService } from "../MessageService/messageService";
import { RedisCacheManager } from "../dataManager/CacheManager/redis";
import { SqlManager } from "../dataManager/DalService/SqlManager";

const cacheManager = new RedisCacheManager();
const sqlInterface = new SqlManager(); // Assuming you have a SqlManager implementation
const messageService = new MessageService(cacheManager, sqlInterface);



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