import { IIngestionOutboxRepository } from "../dataClients/SqlClient/Repositories/IngestionOutboxRepo/IIngestionOutboxRepository";
import { ILogger, logger as rootLogger } from "../logging/logger";
import { ILeadIngestionQueue } from "../QueueClient/leadIngestionQueue";

const LEAD_INGESTION_REQUESTED = "lead.ingestion.requested";

export class LeadOutboxPublisher {
    constructor(
        private readonly outboxRepository: IIngestionOutboxRepository,
        private readonly queue: ILeadIngestionQueue,
        private readonly logger: ILogger = rootLogger.child({ component: "LeadOutboxPublisher" })
    ) {}

    async publishPending(limit = 100): Promise<{ published: number; failed: number }> {
        const pending = await this.outboxRepository.getPending(limit);
        let published = 0;
        let failed = 0;

        for (const item of pending) {
            if (item.eventType !== LEAD_INGESTION_REQUESTED) continue;
            try {
                const incomingLeadId = readIncomingLeadId(item.payload);
                await this.queue.enqueue({ incomingLeadId, businessId: item.businessId }); 
                await this.outboxRepository.markPublished(item.id);
                published++;
            } catch (error) {
                failed++;
                const retryAt = new Date(Date.now() + retryDelayMilliseconds(item.attempts + 1));
                await this.outboxRepository.reschedule(item.id, safeErrorMessage(error), retryAt);
                this.logger.error("leadOutbox.publish.failed", { outboxId: item.id, businessId: item.businessId, error });
            }
        }
        return { published, failed };
    }
}

function readIncomingLeadId(payload: unknown): number {
    const value = (payload as { incomingLeadId?: unknown })?.incomingLeadId;
    if (!Number.isInteger(value) || (value as number) <= 0) throw new Error("Lead ingestion outbox payload is missing incomingLeadId");
    return value as number;
}

function safeErrorMessage(error: unknown): string { return error instanceof Error ? error.message.slice(0, 1000) : "Unknown outbox publish failure"; }
function retryDelayMilliseconds(attempt: number): number { return Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempt - 1)); }
