import "dotenv/config";
import { CaseFollowUpScheduler } from "../../CaseFollowUp/CaseFollowUpScheduler";
import { CaseMissingRequirementResolver } from "../../CaseFollowUp/CaseMissingRequirementResolver";
import { verifyRedisConnection } from "../../dataClients/CacheClient/redis";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { logger } from "../../logging/logger";
import { CaseFollowUpQueue } from "../../QueueClient/caseFollowUpQueue";

const workerLogger = logger.child({ component: "CaseFollowUpSchedulerWorker" });
const sql = new SqlManager(workerLogger.child({ component: "SqlManager" }));
const queue = new CaseFollowUpQueue(workerLogger.child({ component: "CaseFollowUpQueue" }));
const intervalMs = positiveNumber(process.env.CASE_FOLLOW_UP_SCHEDULER_INTERVAL_MS, 60_000);
const scheduler = new CaseFollowUpScheduler(
  sql.caseFollowUpRepository,
  queue,
  new CaseMissingRequirementResolver(),
  workerLogger.child({ component: "CaseFollowUpScheduler" }),
  { intervalMs }
);

start().catch(() => {
  workerLogger.error("case_follow_up.scheduler_worker.startup.failed");
  process.exit(1);
});

async function start(): Promise<void> {
  await verifyRedisConnection(workerLogger);
  scheduler.start();
  workerLogger.info("case_follow_up.scheduler_worker.started", { intervalMs });
}

function shutdown(): void {
  scheduler.stop();
  workerLogger.info("case_follow_up.scheduler_worker.stopped");
  process.exit(0);
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
