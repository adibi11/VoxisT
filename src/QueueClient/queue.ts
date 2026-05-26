import { Queue } from "bullmq";
import { connection } from "../dataClients/CacheClient/redis";
import { ILogger, logger } from "../logging/logger";
import { JobData } from "../dataClients/Types/apiTypes";

export class QueueManager {
    public queue: Queue;
    private logger: ILogger;

    constructor(queueName: string, loggerInstance: ILogger = logger.child({ component: "QueueManager", queueName })) {
        this.logger = loggerInstance;
        this.queue = new Queue(queueName, {
            connection
        });
        this.logger.info("queue.initialized");
    }

    async addEvent(jobData: JobData) {
        this.logger.info("queue.event.enqueue.requested", {
            actionType: jobData.event.type,
            businessId: jobData.event.businessId,
            from: jobData.event.data?.From,
            to: jobData.event.data?.To
        });

        const job = await this.queue.add(
            "event",
            jobData,
            { attempts: 3, backoff: {delay : 1000, type: 'exponential'} }
        );

        this.logger.info("queue.event.enqueued", {
            jobId: job.id,
            actionType: jobData.event.type,
            businessId: jobData.event.businessId
        });

        return job;
    }
}
