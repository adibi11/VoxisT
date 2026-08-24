import "dotenv/config";
import { Worker } from "bullmq";
import { CaseFollowUpMessageBuilder } from "../../CaseFollowUp/CaseFollowUpMessageBuilder";
import { CaseFollowUpWorker } from "../../CaseFollowUp/CaseFollowUpWorker";
import { CaseMissingRequirementResolver } from "../../CaseFollowUp/CaseMissingRequirementResolver";
import { connection, verifyRedisConnection } from "../../dataClients/CacheClient/redis";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { TwilioMessageSender } from "../../MessageSender/twilioMessageSender";
import { PortalAccessService } from "../../Portal/PortalAccessService";
import {
  CaseFollowUpJobData
} from "../../QueueClient/caseFollowUpQueue";
import {
  CASE_FOLLOW_UP_QUEUE_NAME,
  getBullMqPrefix
} from "../../QueueClient/queueNames";
import { logger } from "../../logging/logger";

const workerLogger = logger.child({
  component: "CaseFollowUpWorkerEntrypoint",
  queueName: CASE_FOLLOW_UP_QUEUE_NAME
});
const sql = new SqlManager(workerLogger.child({ component: "SqlManager" }));
const processor = new CaseFollowUpWorker(
  sql.caseFollowUpRepository,
  sql.businessChannelRepository,
  new PortalAccessService(sql.casePortalAccessRepository),
  new TwilioMessageSender({
    logger: workerLogger.child({ component: "TwilioMessageSender" })
  }),
  new CaseMissingRequirementResolver(),
  new CaseFollowUpMessageBuilder(),
  workerLogger.child({ component: "CaseFollowUpWorker" })
);

const worker = new Worker<CaseFollowUpJobData>(
  CASE_FOLLOW_UP_QUEUE_NAME,
  async (job) => {
    const caseFollowUpId = job.data?.caseFollowUpId;
    if (!Number.isInteger(caseFollowUpId) || caseFollowUpId <= 0) {
      workerLogger.warn("case_follow_up.job.invalid", { jobId: job.id });
      return;
    }
    await processor.process(caseFollowUpId);
  },
  {
    connection,
    prefix: getBullMqPrefix(CASE_FOLLOW_UP_QUEUE_NAME),
    autorun: false
  }
);

worker.on("completed", (job) => {
  workerLogger.info("case_follow_up.job.completed", {
    jobId: job.id,
    caseFollowUpId: job.data.caseFollowUpId
  });
});
worker.on("failed", (job) => {
  workerLogger.error("case_follow_up.job.failed", {
    jobId: job?.id,
    caseFollowUpId: job?.data.caseFollowUpId
  });
});
worker.on("error", () => {
  workerLogger.error("case_follow_up.worker.redis.error");
});

start().catch(() => {
  workerLogger.error("case_follow_up.worker.startup.failed");
  process.exit(1);
});

async function start(): Promise<void> {
  await verifyRedisConnection(workerLogger);
  await worker.waitUntilReady();
  void worker.run().catch(() => {
    workerLogger.error("case_follow_up.worker.run.failed");
    process.exit(1);
  });
  workerLogger.info("case_follow_up.worker.started");
}

async function shutdown(): Promise<void> {
  await worker.close();
  workerLogger.info("case_follow_up.worker.stopped");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
