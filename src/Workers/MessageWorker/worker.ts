import "dotenv/config";
import { Worker } from "bullmq";
import { connection, RedisCacheManager, verifyRedisConnection } from "../../dataClients/CacheClient/redis";
import { JobData } from "../../dataClients/Types/apiTypes";
import { MessageService } from "../../MessageService/messageService";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { OpenAIApi } from "../../llm/openaiApi";
import { logger } from "../../logging/logger";
import { QueueManager } from "../../QueueClient/queue";
import { MESSAGE_QUEUE_NAME, OUTBOUND_MESSAGE_QUEUE_NAME } from "../../QueueClient/queueNames";

const workerLogger = logger.child({ component: "MessageWorker", queueName: MESSAGE_QUEUE_NAME });

const openAiApi = new OpenAIApi(workerLogger.child({ component: "OpenAIApi" }));
const cacheManager = new RedisCacheManager();
const sqlInterface = new SqlManager(workerLogger.child({ component: "SqlManager" })); // Assuming you have a SqlManager implementation
const outboundQueue = new QueueManager(OUTBOUND_MESSAGE_QUEUE_NAME, workerLogger.child({ component: "QueueManager", queueName: OUTBOUND_MESSAGE_QUEUE_NAME }));
const messageService = new MessageService(cacheManager, sqlInterface, openAiApi, workerLogger.child({ component: "MessageService" }), outboundQueue);




const worker = new Worker(
  MESSAGE_QUEUE_NAME,
  async (job) => {
    const jobLogger = workerLogger.child({
      jobId: job.id,
      attempt: job.attemptsMade + 1
    });
    jobLogger.info("job.processing.started", {
      actionType: job.data.event?.type,
      channel: job.data.event?.channel,
      provider: job.data.event?.provider,
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
    connection,
    autorun: false
  }
);

worker.on("completed", (job) => {
  workerLogger.info("job.completed", { jobId: job.id });
});

worker.on("failed", (job, err) => {
  workerLogger.error("job.failed", { jobId: job?.id, error: err });
});

worker.on("error", (error) => {
  workerLogger.error("worker.redis.error", { error });
});

startWorker().catch((error) => {
  workerLogger.error("worker.startup.failed", { error });
  process.exit(1);
});

async function startWorker(): Promise<void> {
  await verifyRedisConnection(workerLogger);
  await worker.waitUntilReady();
  workerLogger.info("worker.connection.verify.succeeded", { queueName: MESSAGE_QUEUE_NAME });

  void worker.run().catch((error) => {
    workerLogger.error("worker.run.failed", { error });
    process.exit(1);
  });

  workerLogger.info("worker.started", { queueName: MESSAGE_QUEUE_NAME });
}
