import "dotenv/config";
import { Worker } from "bullmq";
import { CaseFollowUpMessageBuilder } from "../../CaseFollowUp/CaseFollowUpMessageBuilder";
import { CaseFollowUpWorker } from "../../CaseFollowUp/CaseFollowUpWorker";
import { CaseMissingRequirementResolver } from "../../CaseFollowUp/CaseMissingRequirementResolver";
import { connection, verifyRedisConnection } from "../../dataClients/CacheClient/redis";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { TwilioMessageSender } from "../../MessageSender/twilioMessageSender";
import { PortalAccessService } from "../../Portal/PortalAccessService";
import { CaseInboundEmailService } from "../../InboundEmail/CaseInboundEmailService";
import { inboundEmailDomainFromEnv } from "../../InboundEmail/InboundEmailConfig";
import {
  CaseFollowUpJobData
} from "../../QueueClient/caseFollowUpQueue";
import {
  CASE_FOLLOW_UP_QUEUE_NAME,
  getBullMqPrefix
} from "../../QueueClient/queueNames";
import { logger } from "../../logging/logger";
import { createVoiceRuntime } from "../../Voice/VoiceRuntime";
import { ElevenLabsVoiceCallProvider } from "../../Voice/Providers/ElevenLabs/ElevenLabsVoiceCallProvider";

const workerLogger = logger.child({
  component: "CaseFollowUpWorkerEntrypoint",
  queueName: CASE_FOLLOW_UP_QUEUE_NAME
});
const sql = new SqlManager(workerLogger.child({ component: "SqlManager" }));
const portalAccess = new PortalAccessService(sql.casePortalAccessRepository);
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY?.trim();
if (!elevenLabsApiKey) throw new Error("ELEVENLABS_API_KEY is required for the case follow-up worker");
const processor = new CaseFollowUpWorker(
  sql.caseFollowUpRepository,
  sql.businessChannelRepository,
  portalAccess,
  new CaseInboundEmailService(sql.inboundEmailRepository, inboundEmailDomainFromEnv()),
  new TwilioMessageSender({
    logger: workerLogger.child({ component: "TwilioMessageSender" })
  }),
  new CaseMissingRequirementResolver(),
  new CaseFollowUpMessageBuilder(),
  workerLogger.child({ component: "CaseFollowUpWorker" }),
  () => new Date(),
  createVoiceRuntime(sql, portalAccess, new ElevenLabsVoiceCallProvider({ apiKey: elevenLabsApiKey }))
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
