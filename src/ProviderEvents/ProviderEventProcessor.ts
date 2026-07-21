import { randomUUID } from "crypto";
import { IProviderWebhookEventRepository } from "../dataClients/SqlClient/Repositories/ProviderWebhookEventRepo/IProviderWebhookEventRepository";
import { ProviderWebhookEventDto } from "../dataClients/Types/leadIngestionTypes";
import { ILogger, logger as rootLogger } from "../logging/logger";

export class ProviderEventHandlingError extends Error {
    constructor(message: string, readonly retryable: boolean, readonly code = retryable ? "TRANSIENT_PROVIDER_ERROR" : "PROVIDER_EVENT_INVALID") { super(message); this.name = "ProviderEventHandlingError"; }
}

export interface IProviderEventHandler {
    supports(event: ProviderWebhookEventDto): boolean;
    handle(event: ProviderWebhookEventDto): Promise<void>;
}

export class ProviderEventProcessor {
    readonly workerId: string;
    constructor(
        private readonly events: IProviderWebhookEventRepository,
        private readonly handlers: IProviderEventHandler[],
        private readonly logger: ILogger = rootLogger.child({ component: "ProviderEventProcessor" }),
        workerId = `provider-event-processor:${randomUUID()}`,
        private readonly lockDurationMilliseconds = 60_000,
        private readonly maxAttempts = 10
    ) { this.workerId = workerId; }

    async processNext(): Promise<{ outcome: "idle" | "processed" | "retried" | "failed"; eventId?: number }> {
        const event = await this.events.claimNext(this.workerId, this.lockDurationMilliseconds);
        if (!event) return { outcome: "idle" };
        try {
            const handler = this.handlers.find((item) => item.supports(event));
            if (!handler) 
                throw new ProviderEventHandlingError(`No handler registered for ${event.provider}:${event.eventType}`, false, "UNSUPPORTED_PROVIDER_EVENT");
            await handler.handle(event);
            await this.events.markProcessed(event.id, this.workerId);
            this.logger.info("providerEvent.processed", { eventId: event.id, provider: event.provider, eventType: event.eventType, attempts: event.attempts });
            return { outcome: "processed", eventId: event.id };
        } catch (error) {
            const normalized = normalizeError(error);
            if (normalized.retryable && event.attempts < this.maxAttempts) {
                const nextAttemptAt = new Date(Date.now() + retryDelayMilliseconds(event.attempts));
                await this.events.reschedule(event.id, this.workerId, nextAttemptAt, normalized.message);
                this.logger.warn("providerEvent.retryScheduled", { eventId: event.id, attempts: event.attempts, nextAttemptAt: nextAttemptAt.toISOString(), error: normalized.message });
                return { outcome: "retried", eventId: event.id };
            }
            await this.events.markFailed(event.id, this.workerId, normalized.code, normalized.message);
            this.logger.error("providerEvent.failed", { eventId: event.id, attempts: event.attempts, code: normalized.code, error });
            return { outcome: "failed", eventId: event.id };
        }
    }
}

function normalizeError(error: unknown): ProviderEventHandlingError {
    if (error instanceof ProviderEventHandlingError) return error;
    return new ProviderEventHandlingError(error instanceof Error ? error.message : "Provider event processing failed", true);
}

function retryDelayMilliseconds(attempts: number): number {
    return Math.min(60 * 60 * 1000, 1_000 * Math.pow(2, Math.max(0, attempts - 1)));
}
