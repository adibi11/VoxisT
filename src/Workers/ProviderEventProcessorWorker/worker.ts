import "dotenv/config";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { LeadIngestionService } from "../../LeadIngestion/LeadIngestionService";
import { logger } from "../../logging/logger";
import { MetaLeadHydrator } from "../../ProviderEvents/MetaLeadHydrator";
import { ProviderEventProcessor } from "../../ProviderEvents/ProviderEventProcessor";

const workerLogger = logger.child({ component: "ProviderEventProcessorWorker" });
const sql = new SqlManager(workerLogger.child({ component: "SqlManager" }));
const ingestion = new LeadIngestionService(sql.leadIngestionRepository, workerLogger.child({ component: "LeadIngestionService" }));
const processor = new ProviderEventProcessor(sql.providerWebhookEventRepository, [new MetaLeadHydrator(sql.integrationConnectionRepository, ingestion)], workerLogger.child({ component: "ProviderEventProcessor" }));
const pollIntervalMilliseconds = positiveInteger("PROVIDER_EVENT_PROCESS_INTERVAL_MS", 2_000);
let stopping = false;

async function poll(): Promise<void> {
    if (stopping) return;
    try {
        const result = await processor.processNext();
        if (result.outcome !== "idle") 
            workerLogger.info("providerEventProcessor.cycle.completed", result);
    } catch (error) 
    { 
        workerLogger.error("providerEventProcessor.cycle.failed", { error }); 
    }
    if (!stopping) setTimeout(() => void poll(), pollIntervalMilliseconds);
}

async function shutdown(signal: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    workerLogger.info("providerEventProcessor.stopped", { signal });
    process.exit(0);
}

workerLogger.info("providerEventProcessor.started", { pollIntervalMilliseconds });
void poll();
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

function positiveInteger(name: string, fallback: number): number {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
    return value;
}
