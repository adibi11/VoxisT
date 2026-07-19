import { Queue } from "bullmq";
import { connection } from "../dataClients/CacheClient/redis";
import { ILogger, logger } from "../logging/logger";
import { getBullMqPrefix, LEAD_INGESTION_QUEUE_NAME } from "./queueNames";

export type LeadIngestionJobData = { incomingLeadId: number; businessId: number };

export interface ILeadIngestionQueue {
    enqueue(data: LeadIngestionJobData): Promise<void>;
}

export class LeadIngestionQueue implements ILeadIngestionQueue {
    readonly queue: Queue<LeadIngestionJobData>;

    constructor(private readonly logger: ILogger = logger.child({ component: "LeadIngestionQueue" })) {
        this.queue = new Queue<LeadIngestionJobData>(LEAD_INGESTION_QUEUE_NAME, {
            connection,
            prefix: getBullMqPrefix(LEAD_INGESTION_QUEUE_NAME)
        });
    }

    async enqueue(data: LeadIngestionJobData): Promise<void> {
        const jobId = `lead-ingestion:${data.incomingLeadId}`;
        await this.queue.add("process-lead-ingestion", data, {
            jobId,
            attempts: 5,
            backoff: { type: "exponential", delay: 30_000 },
            removeOnComplete: false,
            removeOnFail: false
        });
        this.logger.info("leadIngestionQueue.enqueued", { jobId, ...data });
    }
}
