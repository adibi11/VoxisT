import { describe, expect, it } from "vitest";
import { LeadOutboxPublisher } from "../../src/LeadIngestion/LeadOutboxPublisher";
import { IIngestionOutboxRepository } from "../../src/dataClients/SqlClient/Repositories/IngestionOutboxRepo/IIngestionOutboxRepository";
import { CreateIngestionOutboxInput, IngestionOutboxDto } from "../../src/dataClients/Types/leadIngestionTypes";
import { LeadIngestionJobData } from "../../src/LeadIngestion/LeadProcessor";

describe("LeadOutboxPublisher", () => {
    it("publishes a pending lead-ingestion outbox event with deterministic job data", async () => {
        const outbox = new FakeOutboxRepository();
        const processor = new FakeLeadProcessor();
        const publisher = new LeadOutboxPublisher(outbox, { info() {}, warn() {}, error() {}, child() { return this; } }, processor as any);

        await expect(publisher.publishPending()).resolves.toEqual({ published: 1, failed: 0 });
        expect(processor.jobs).toEqual([{ incomingLeadId: 41, businessId: 7 }]);
        expect(outbox.published).toEqual([1]);
    });
});

class FakeLeadProcessor {
    jobs: LeadIngestionJobData[] = [];
    async process(data: LeadIngestionJobData): Promise<void> { this.jobs.push(data); }
}

class FakeOutboxRepository implements IIngestionOutboxRepository {
    published: number[] = [];
    private readonly item: IngestionOutboxDto = {
        id: 1, businessId: 7, aggregateType: "incoming_lead", aggregateId: 41,
        eventType: "lead.ingestion.requested", payload: { incomingLeadId: 41 },
        status: "PENDING", attempts: 0, availableAt: new Date(), publishedAt: null,
        lastError: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    async create(_input: CreateIngestionOutboxInput): Promise<IngestionOutboxDto> { return this.item; }
    async getPending(): Promise<IngestionOutboxDto[]> { return [this.item]; }
    async markPublished(id: number): Promise<IngestionOutboxDto> { this.published.push(id); return this.item; }
    async markFailed(): Promise<IngestionOutboxDto> { return this.item; }
    async reschedule(): Promise<IngestionOutboxDto> { return this.item; }
}
