import "dotenv/config";
import { verifyRedisConnection } from "../../dataClients/CacheClient/redis";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { CampaignLeadProcessor } from "../../LeadIngestion/LeadProcessor";
import { logger } from "../../logging/logger";
import { LEAD_INGESTION_QUEUE_NAME } from "../../QueueClient/queueNames";
import { createLeadIngestionWorker } from "./LeadIngestionWorker";

const workerLogger = logger.child({ component: "LeadIngestionWorker", queueName: LEAD_INGESTION_QUEUE_NAME });
const sql = new SqlManager(workerLogger.child({ component: "SqlManager" }));
const processor = new CampaignLeadProcessor(sql.leadProcessingRepository);
const worker = createLeadIngestionWorker(processor, sql.incomingLeadRepository, workerLogger);

async function start(): Promise<void> {
    await verifyRedisConnection(workerLogger);
    await worker.waitUntilReady();
    void worker.run().catch((error) => { workerLogger.error("leadIngestionWorker.run.failed", { error }); process.exit(1); });
    workerLogger.info("leadIngestionWorker.started");
}

start().catch((error) => { workerLogger.error("leadIngestionWorker.startup.failed", { error }); process.exit(1); });
