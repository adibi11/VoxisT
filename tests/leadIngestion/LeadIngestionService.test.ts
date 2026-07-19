import { describe, expect, it } from "vitest";
import { LeadIngestionService } from "../../src/LeadIngestion/LeadIngestionService";
import { CanonicalLeadSubmission, ResolvedLeadConnection } from "../../src/LeadIngestion/canonicalLeadSubmission";
import { ILeadIngestionRepository, PersistLeadIngestionInput, PersistLeadIngestionResult } from "../../src/dataClients/SqlClient/Repositories/LeadIngestionRepo/ILeadIngestionRepository";

describe("LeadIngestionService", () => {
    it("persists a canonical submission through the atomic ingestion repository", async () => {
        const repository = new CapturingLeadIngestionRepository();
        const service = new LeadIngestionService(repository);

        const result = await service.ingest({ connection, submission, rawPayload: { providerField: "value" } });

        expect(result).toEqual({ outcome: "accepted", incomingLeadId: 101 });
        expect(repository.input).toMatchObject({
            businessId: 7,
            integrationConnectionId: 3,
            provider: "test_provider",
            eventType: "lead.created",
            providerEventId: "event-1"
        });
        expect(repository.input?.idempotencyKey).toBe("event:test_provider:event-1");
        expect(repository.input?.payloadHash).toHaveLength(64);
    });

    it("rejects a submission whose provider does not match the resolved connection", async () => {
        const service = new LeadIngestionService(new CapturingLeadIngestionRepository());
        await expect(service.ingest({ connection, submission: { ...submission, source: { ...submission.source, provider: "other_provider" } } }))
            .rejects.toThrow("provider does not match");
    });
});

const connection: ResolvedLeadConnection = {
    connectionId: 3,
    businessId: 7,
    provider: "test_provider",
    integrationType: "FORM"
};

const submission: CanonicalLeadSubmission = {
    schemaVersion: 1,
    source: { provider: "test_provider", integrationType: "FORM", eventType: "lead.created", externalEventId: "event-1", receivedAt: "2026-07-19T10:00:00.000Z" },
    person: { fullName: "Example Lead", email: "lead@example.test" },
    answers: { fields: [] }
};

class CapturingLeadIngestionRepository implements ILeadIngestionRepository {
    input?: PersistLeadIngestionInput;

    async persistReceivedLead(input: PersistLeadIngestionInput): Promise<PersistLeadIngestionResult> {
        this.input = input;
        return {
            outcome: "accepted",
            incomingLead: {
                ...input,
                id: 101,
                status: "RECEIVED",
                failureCode: null,
                failureDetail: null,
                receivedAt: "2026-07-19T10:00:00.000Z",
                processedAt: null,
                externalLeadId: null
            }
        };
    }
}
