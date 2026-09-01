import "dotenv/config";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { LeadOutboxPublisher } from "../../LeadIngestion/LeadOutboxPublisher";
import { logger } from "../../logging/logger";
import { CampaignLeadProcessor } from "../../LeadIngestion/LeadProcessor";

const workerLogger = logger.child({ component: "LeadOutboxPublisherWorker" });
const sql = new SqlManager(workerLogger.child({ component: "SqlManager" }));
const processor = new CampaignLeadProcessor(sql.leadProcessingRepository);
const publisher = new LeadOutboxPublisher(
    sql.ingestionOutboxRepository,
    workerLogger.child({ component: "LeadOutboxPublisher" }),
    processor
);
const pollIntervalMilliseconds = getPositiveInteger("LEAD_OUTBOX_PUBLISH_INTERVAL_MS", 2_000);
let stopping = false;

async function start(): Promise<void> {
    workerLogger.info("leadOutboxPublisher.started", { pollIntervalMilliseconds });
    await poll();
}

async function poll(): Promise<void> {
    if (stopping) return;
    try {
        const result = await publisher.publishPending();
        if (result.published > 0 || result.failed > 0) {
            workerLogger.info("leadOutboxPublisher.cycle.completed", result);
        }
    } catch (error) {
        workerLogger.error("leadOutboxPublisher.cycle.failed", { error });
    }
    if (!stopping) setTimeout(() => void poll(), pollIntervalMilliseconds);
}

async function shutdown(signal: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    workerLogger.info("leadOutboxPublisher.stopping", { signal });
    workerLogger.info("leadOutboxPublisher.stopped");
    process.exit(0);
}

start().catch((error) => {
    workerLogger.error("leadOutboxPublisher.startup.failed", { error });
    process.exit(1);
});

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

function getPositiveInteger(name: string, fallback: number): number {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
    return value;
}
