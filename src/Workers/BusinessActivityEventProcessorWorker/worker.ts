import "dotenv/config";
import { BusinessActivityEventProcessorService } from "../../BusinessEvents/BusinessActivityEventProcessorService";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { logger } from "../../logging/logger";

const workerLogger = logger.child({ component: "BusinessActivityEventProcessorWorker" });
const sql = new SqlManager(workerLogger.child({ component: "SqlManager" }));
const intervalMs = Number(process.env.BUSINESS_ACTIVITY_EVENT_PROCESSOR_INTERVAL_MS || 60_000);
const service = new BusinessActivityEventProcessorService(sql.getPrismaClient(), workerLogger.child({ component: "BusinessActivityEventProcessorService" }), { intervalMs });

service.start();
workerLogger.info("business_event.processor_worker.started", { intervalMs });
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown(): void {
  service.stop();
  process.exit(0);
}
