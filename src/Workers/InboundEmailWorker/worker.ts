import "dotenv/config";
import { InboundEmailProcessor } from "../../InboundEmail/InboundEmailProcessor";
import { inboundEmailConfigFromEnv } from "../../InboundEmail/InboundEmailConfig";
import { S3RawEmailStorage } from "../../InboundEmail/RawEmailStorage";
import { OpenAIInboundDocumentClassifier } from "../../InboundEmail/OpenAIInboundDocumentClassifier";
import { SqlManager } from "../../dataClients/SqlClient/SqlManager";
import { logger } from "../../logging/logger";
import { AwsSqsClient } from "../../QueueClient/Sqs/AwsSqsClient";
import { documentStorageConfigFromEnv, S3DocumentStorage } from "../../Storage/DocumentStorage/S3DocumentStorage";

const config = inboundEmailConfigFromEnv();
const workerLogger = logger.child({ component: "InboundEmailWorker", queueName: config.queueName });
const sql = new SqlManager(workerLogger.child({ component: "SqlManager" }));
const processor = new InboundEmailProcessor(
  AwsSqsClient.fromEnvironment(process.env, config.queueName),
  new S3RawEmailStorage(config.rawBucketName, config.region),
  new S3DocumentStorage(documentStorageConfigFromEnv()),
  sql.inboundEmailRepository,
  config.domain,
  workerLogger.child({ component: "InboundEmailProcessor" }),
  new OpenAIInboundDocumentClassifier(workerLogger.child({ component: "OpenAIInboundDocumentClassifier" }))
);
let stopping = false;
async function poll(): Promise<void> {
  while (!stopping) {
    try { await processor.pollOnce(); }
    catch (error) { workerLogger.error("inbound_email.poll.failed", { error }); await new Promise((resolve) => setTimeout(resolve, 1000)); }
  }
}
function shutdown(signal: string): void { stopping = true; workerLogger.info("inbound_email.worker.stopping", { signal }); }
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
workerLogger.info("inbound_email.worker.started", { domain: config.domain, region: config.region });
void poll().catch((error) => { workerLogger.error("inbound_email.worker.fatal", { error }); process.exitCode = 1; });
