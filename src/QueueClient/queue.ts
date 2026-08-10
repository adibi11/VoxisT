import { Queue } from "bullmq";
import { connection } from "../dataClients/CacheClient/redis";
import { ILogger, logger } from "../logging/logger";
import { JobData } from "../dataClients/Types/apiTypes";
import { OutboundMessageJobData } from "../dataClients/Types/outboundTypes";
import { getBullMqPrefix } from "./queueNames";

export interface IOutboundMessageQueue {
    addOutboundMessage(jobData: OutboundMessageJobData): Promise<unknown>;
}

export interface IMessageQueue {
    addEvent(jobData: JobData): Promise<unknown>;
}

export class QueueManager {

    public queue: Queue;
    private logger: ILogger;

    constructor(queueName: string, loggerInstance: ILogger = logger.child({ component: "QueueManager", queueName })) {
        this.logger = loggerInstance;
        this.queue = new Queue(queueName, {
            connection,
            prefix: getBullMqPrefix(queueName)
        });
        this.logger.info("queue.initialized");
    }

    async addEvent(jobData: JobData) {
        this.logger.info("queue.event.enqueue.requested", {
            actionType: jobData.event.type,
            channel: jobData.event.channel,
            provider: jobData.event.provider,
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
            channel: jobData.event.channel,
            provider: jobData.event.provider,
            businessId: jobData.event.businessId
        });

        return job;
    }

    async addOutboundMessage(jobData: OutboundMessageJobData) {
        this.logger.info("queue.outbound.enqueue.requested", {
            channel: jobData.message.channel,
            provider: jobData.message.provider,
            businessId: jobData.message.businessId,
            clientId: jobData.message.clientId,
            conversationId: jobData.message.conversationId,
            messageId: jobData.message.messageId,
            from: jobData.message.from,
            to: jobData.message.to,
            bodyLength: jobData.message.body.length
        });

        const job = await this.queue.add(
            "send-message",
            jobData,
            {
                attempts: 3,
                backoff: { delay: 1000, type: "exponential" },
                ...(jobData.message.messageId
                    ? { jobId: `message-${jobData.message.messageId}` }
                    : {})
            }
        );

        this.logger.info("queue.outbound.enqueued", {
            jobId: job.id,
            channel: jobData.message.channel,
            provider: jobData.message.provider,
            businessId: jobData.message.businessId,
            clientId: jobData.message.clientId,
            conversationId: jobData.message.conversationId
        });

        return job;
    }
}
