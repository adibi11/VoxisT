import "dotenv/config";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { TaskScheduleService } from "../../Tasks/TaskScheduleService";
import { logger } from "../../logging/logger";

const workerLogger = logger.child({ component: "TaskScheduleWorker" });
const sql = new SqlManager(workerLogger.child({ component: "SqlManager" }));
const intervalMs = Number(process.env.TASK_SCHEDULE_INTERVAL_MS || 60_000);
const service = new TaskScheduleService(sql.getPrismaClient(), workerLogger.child({ component: "TaskScheduleService" }), { intervalMs });

service.start();
workerLogger.info("task.schedule_worker.started", { intervalMs });
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown(): void {
  service.stop();
  process.exit(0);
}
