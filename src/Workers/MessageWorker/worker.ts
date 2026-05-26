import "dotenv/config";
import { Worker } from "bullmq";
import { connection } from "../../dataClients/CacheClient/redis";
import { JobData } from "../../dataClients/Types/apiTypes";
import { MessageService } from "../../MessageService/messageService";
import { RedisCacheManager } from "../../dataClients/CacheClient/redis";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { OpenAIApi } from "../../llm/openaiApi";
import { logger } from "../../logging/logger";

const workerLogger = logger.child({ component: "MessageWorker", queueName: "message-queue" });

const openAiApi = new OpenAIApi(workerLogger.child({ component: "OpenAIApi" }));
const cacheManager = new RedisCacheManager();
const sqlInterface = new SqlManager(workerLogger.child({ component: "SqlManager" })); // Assuming you have a SqlManager implementation
const messageService = new MessageService(cacheManager, sqlInterface, openAiApi, workerLogger.child({ component: "MessageService" }));




const worker = new Worker(
  "message-queue",
  async (job) => {
    const jobLogger = workerLogger.child({
      jobId: job.id,
      attempt: job.attemptsMade + 1
    });
    jobLogger.info("job.processing.started", {
      actionType: job.data.event?.type,
      businessId: job.data.event?.businessId,
      from: job.data.event?.data?.From,
      to: job.data.event?.data?.To,
      bodyLength: job.data.event?.data?.Body?.length
    });

    const  message  = job.data as JobData;

    // simulate processing
    try {
        await messageService.processMessage(message.event);
        jobLogger.info("job.processing.finished");
    } catch (error) {
        jobLogger.error("job.processing.failed", { error });
        throw error; // rethrow to trigger retry
    }

    
    
  },
  {
    connection
  }
);

worker.on("completed", (job) => {
  workerLogger.info("job.completed", { jobId: job.id });
});

worker.on("failed", (job, err) => {
  workerLogger.error("job.failed", { jobId: job?.id, error: err });
});
