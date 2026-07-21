import { describe, expect, it } from "vitest";
import { IProviderWebhookEventRepository } from "../../src/dataClients/SqlClient/Repositories/ProviderWebhookEventRepo/IProviderWebhookEventRepository";
import { ProviderWebhookEventDto } from "../../src/dataClients/Types/leadIngestionTypes";
import { IProviderEventHandler, ProviderEventHandlingError, ProviderEventProcessor } from "../../src/ProviderEvents/ProviderEventProcessor";

describe("ProviderEventProcessor", () => {
    it("marks a handled event processed", async () => {
        const repo = new FakeEventRepository(event());
        const processor = new ProviderEventProcessor(repo, [handler(async () => undefined)], silentLogger, "worker-1");

        await expect(processor.processNext()).resolves.toEqual({ outcome: "processed", eventId: 12 });
        expect(repo.processed).toEqual({ id: 12, workerId: "worker-1" });
    });

    it("reschedules transient failures with backoff", async () => {
        const repo = new FakeEventRepository(event());
        const processor = new ProviderEventProcessor(repo, [handler(async () => { throw new ProviderEventHandlingError("Meta is temporarily unavailable", true); })], silentLogger, "worker-1");

        await expect(processor.processNext()).resolves.toEqual({ outcome: "retried", eventId: 12 });
        expect(repo.rescheduled?.id).toBe(12);
        expect(repo.rescheduled?.workerId).toBe("worker-1");
        expect(repo.rescheduled?.error).toBe("Meta is temporarily unavailable");
    });

    it("marks permanent failures failed", async () => {
        const repo = new FakeEventRepository(event());
        const processor = new ProviderEventProcessor(repo, [handler(async () => { throw new ProviderEventHandlingError("Meta token revoked", false, "META_TOKEN_INVALID"); })], silentLogger, "worker-1");

        await expect(processor.processNext()).resolves.toEqual({ outcome: "failed", eventId: 12 });
        expect(repo.failed).toEqual({ id: 12, workerId: "worker-1", code: "META_TOKEN_INVALID", detail: "Meta token revoked" });
    });
});

function handler(run: (event: ProviderWebhookEventDto) => Promise<void>): IProviderEventHandler { return { supports: () => true, handle: run }; }
function event(): ProviderWebhookEventDto { return { id: 12, businessId: 2, integrationConnectionId: 4, provider: "meta", eventType: "leadgen", providerEventId: "leadgen:99", payloadHash: "hash", payload: { leadgen: { leadgenId: "99" } }, status: "PROCESSING", attempts: 1, nextAttemptAt: new Date().toISOString(), lockedUntil: null, workerId: "worker-1", lastError: null, failureCode: null, failureDetail: null, receivedAt: new Date().toISOString(), processedAt: null }; }

class FakeEventRepository implements IProviderWebhookEventRepository {
    processed?: { id: number; workerId: string };
    rescheduled?: { id: number; workerId: string; nextAttemptAt: Date; error: string };
    failed?: { id: number; workerId: string; code: string; detail: string };
    constructor(private next: ProviderWebhookEventDto | null) {}
    async record(): Promise<any> { throw new Error("Not used"); }
    async claimNext(): Promise<ProviderWebhookEventDto | null> { const value = this.next; this.next = null; return value; }
    async markProcessed(id: number, workerId: string): Promise<boolean> { this.processed = { id, workerId }; return true; }
    async reschedule(id: number, workerId: string, nextAttemptAt: Date, error: string): Promise<boolean> { this.rescheduled = { id, workerId, nextAttemptAt, error }; return true; }
    async markFailed(id: number, workerId: string, code: string, detail: string): Promise<boolean> { this.failed = { id, workerId, code, detail }; return true; }
}

const silentLogger: any = { info: () => undefined, warn: () => undefined, error: () => undefined, child: () => silentLogger };
