import "dotenv/config";
import { verifyRedisConnection } from "../../dataClients/CacheClient/redis";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { ScheduledFollowUpService } from "../../FollowUp/ScheduledFollowUpService";
import { logger } from "../../logging/logger";
import { QueueManager } from "../../QueueClient/queue";
import { MESSAGE_QUEUE_NAME } from "../../QueueClient/queueNames";

const workerLogger = logger.child({ component: "FollowUpSchedulerWorker" });
const sql = new SqlManager(workerLogger.child({ component: "SqlManager" }));
const outboundQueue = new QueueManager(
    MESSAGE_QUEUE_NAME,
    workerLogger.child({ component: "QueueManager", queueName: MESSAGE_QUEUE_NAME })
);
const intervalMs = Number(process.env.FOLLOW_UP_SCHEDULER_INTERVAL_MS || 60_000);
const scheduledFollowUpService = new ScheduledFollowUpService(
    sql,
    outboundQueue,
    workerLogger.child({ component: "ScheduledFollowUpService" }),
    { intervalMs }
);

startWorker().catch((error) => {
    workerLogger.error("follow_up.scheduler_worker.startup.failed", { error });
    process.exit(1);
});

async function startWorker(): Promise<void> {
    await verifyRedisConnection(workerLogger);
    scheduledFollowUpService.start();
    workerLogger.info("follow_up.scheduler_worker.started", { intervalMs });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown(): void {
    workerLogger.info("follow_up.scheduler_worker.shutdown.started");
    scheduledFollowUpService.stop();
    process.exit(0);
}
