import { Worker } from "bullmq";
import { connection } from "../../dataClients/CacheClient/redis";
import { ILogger, logger } from "../../logging/logger";
import { ILeadProcessor } from "../../LeadIngestion/LeadProcessor";
import { LeadIngestionJobData } from "../../QueueClient/leadIngestionQueue";
import { getBullMqPrefix, LEAD_INGESTION_QUEUE_NAME } from "../../QueueClient/queueNames";
import { IIncomingLeadRepository } from "../../dataClients/SqlClient/Repositories/IncomingLeadRepo/IIncomingLeadRepository";

export function createLeadIngestionWorker(processor: ILeadProcessor, incomingLeads: IIncomingLeadRepository, loggerInstance: ILogger = logger.child({ component: "LeadIngestionWorker" })): Worker<LeadIngestionJobData> {
    const worker = new Worker<LeadIngestionJobData>(
        LEAD_INGESTION_QUEUE_NAME,
        async (job) => {
            loggerInstance.info("leadIngestionWorker.processing", { jobId: job.id, incomingLeadId: job.data.incomingLeadId, businessId: job.data.businessId, attempt: job.attemptsMade + 1 });
            await processor.process(job.data);
        },
        { connection, prefix: getBullMqPrefix(LEAD_INGESTION_QUEUE_NAME), autorun: false }
    );
    worker.on("failed", async (job, error) => {
        if (!job || job.attemptsMade < (job.opts.attempts || 1)) return;
        try {
            await incomingLeads.updateStatus(job.data.businessId, job.data.incomingLeadId, "FAILED", { code: "PROCESSING_RETRIES_EXHAUSTED", detail: error.message });
        } catch (statusError) {
            loggerInstance.error("leadIngestionWorker.failureStatusUpdate.failed", { jobId: job.id, statusError });
        }
    });
    return worker;
}
