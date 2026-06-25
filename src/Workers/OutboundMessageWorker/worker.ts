import "dotenv/config";
import { Worker } from "bullmq";
import { connection, verifyRedisConnection } from "../../dataClients/CacheClient/redis";
import { OutboundMessageJobData } from "../../dataClients/Types/outboundTypes";
import { logger } from "../../logging/logger";
import { TwilioMessageSender } from "../../MessageSender/twilioMessageSender";
import { OUTBOUND_MESSAGE_QUEUE_NAME } from "../../QueueClient/queueNames";

const workerLogger = logger.child({ component: "OutboundMessageWorker", queueName: OUTBOUND_MESSAGE_QUEUE_NAME });
const twilioSender = new TwilioMessageSender({
  logger: workerLogger.child({ component: "TwilioMessageSender" })
});

const worker = new Worker(
  OUTBOUND_MESSAGE_QUEUE_NAME,
  async (job) => {
    const jobLogger = workerLogger.child({
      jobId: job.id,
      attempt: job.attemptsMade + 1
    });
    const jobData = job.data as OutboundMessageJobData;

    jobLogger.info("outbound.job.processing.started", {
      channel: jobData.message.channel,
      provider: jobData.message.provider,
      businessId: jobData.message.businessId,
      clientId: jobData.message.clientId,
      conversationId: jobData.message.conversationId,
      messageId: jobData.message.messageId,
      from: jobData.message.from,
      to: jobData.message.to,
      bodyLength: jobData.message.body.length
    });

    try {
      const result = await twilioSender.sendMessage(jobData.message);
      jobLogger.info("outbound.job.processing.finished", {
        providerMessageId: result.providerMessageId,
        sentAt: result.sentAt
      });
    } catch (error) {
      jobLogger.error("outbound.job.processing.failed", { error });
      throw error;
    }
  },
  {
    connection,
    autorun: false
  }
);

worker.on("completed", (job) => {
  workerLogger.info("outbound.job.completed", { jobId: job.id });
});

worker.on("failed", (job, err) => {
  workerLogger.error("outbound.job.failed", { jobId: job?.id, error: err });
});

worker.on("error", (error) => {
  workerLogger.error("outbound.worker.redis.error", { error });
});

startWorker().catch((error) => {
  workerLogger.error("outbound.worker.startup.failed", { error });
  process.exit(1);
});

async function startWorker(): Promise<void> {
  await verifyRedisConnection(workerLogger);
  await worker.waitUntilReady();
  workerLogger.info("outbound.worker.connection.verify.succeeded", { queueName: OUTBOUND_MESSAGE_QUEUE_NAME });

  void worker.run().catch((error) => {
    workerLogger.error("outbound.worker.run.failed", { error });
    process.exit(1);
  });

  workerLogger.info("outbound.worker.started", { queueName: OUTBOUND_MESSAGE_QUEUE_NAME });
}
