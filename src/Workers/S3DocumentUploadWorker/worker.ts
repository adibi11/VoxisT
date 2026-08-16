import "dotenv/config";
import { S3DocumentUploadEventProcessor } from "../../Documents/S3DocumentUploadEventProcessor";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { logger } from "../../logging/logger";
import { AwsSqsClient, S3_DOCUMENT_QUEUE_NAME } from "../../QueueClient/Sqs/AwsSqsClient";

const workerLogger = logger.child({ component: "S3DocumentUploadWorker", queueName: S3_DOCUMENT_QUEUE_NAME });
const sql = new SqlManager(workerLogger.child({ component: "SqlManager" }));
const processor = new S3DocumentUploadEventProcessor(
  AwsSqsClient.fromEnvironment(),
  sql.documentRepository,
  workerLogger.child({ component: "S3DocumentUploadEventProcessor" })
);
let stopping = false;

async function poll(): Promise<void> {
  while (!stopping) {
    try {
      const result = await processor.pollOnce();
      if (result.received > 0) workerLogger.info("s3DocumentUploadWorker.cycle.completed", result);
    } catch (error) {
      workerLogger.error("s3DocumentUploadWorker.poll.failed", { error });
      await delay(1_000);
    }
  }
}

function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  workerLogger.info("s3DocumentUploadWorker.stopping", { signal });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

workerLogger.info("s3DocumentUploadWorker.started");
void poll().catch((error) => {
  workerLogger.error("s3DocumentUploadWorker.failed", { error });
  process.exit(1);
});
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
