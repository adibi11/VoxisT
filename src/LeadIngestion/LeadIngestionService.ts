import { ILeadIngestionRepository } from "../dataClients/SqlClient/Repositories/LeadIngestionRepo/ILeadIngestionRepository";
import { ILogger, logger as rootLogger } from "../logging/logger";
import { CanonicalLeadSubmission, ResolvedLeadConnection, validateCanonicalLeadSubmission } from "./canonicalLeadSubmission";
import { createCanonicalPayloadHash, createLeadIdempotencyKey } from "./idempotency";

export type LeadIngestionRequest = {
    connection: ResolvedLeadConnection;
    submission: CanonicalLeadSubmission;
    rawPayload?: unknown;
};

export type LeadIngestionResult = {
    outcome: "accepted" | "duplicate";
    incomingLeadId: number;
};

export class LeadIngestionService {
    constructor(
        private readonly repository: ILeadIngestionRepository,
        private readonly logger: ILogger = rootLogger.child({ component: "LeadIngestionService" })
    ) {}

    async ingest(request: LeadIngestionRequest): Promise<LeadIngestionResult> {
        validateCanonicalLeadSubmission(request.submission);
        this.assertConnectionMatchesSubmission(request.connection, request.submission);

        const idempotencyKey = createLeadIdempotencyKey(request.connection, request.submission);
        const result = await this.repository.persistReceivedLead({
            businessId: request.connection.businessId,
            integrationConnectionId: request.connection.connectionId,
            provider: request.connection.provider,
            eventType: request.submission.source.eventType.trim(),
            providerEventId: request.submission.source.externalEventId?.trim(),
            idempotencyKey,
            payloadHash: createCanonicalPayloadHash(request.submission),
            rawPayload: request.rawPayload,
            canonicalPayload: request.submission
        });

        this.logger.info("lead.ingestion.persisted", {
            businessId: request.connection.businessId,
            connectionId: request.connection.connectionId,
            provider: request.connection.provider,
            incomingLeadId: result.incomingLead.id,
            outcome: result.outcome
        });
        return { outcome: result.outcome, incomingLeadId: result.incomingLead.id };
    }

    private assertConnectionMatchesSubmission(connection: ResolvedLeadConnection, submission: CanonicalLeadSubmission): void {
        if (connection.provider !== submission.source.provider.trim()) throw new Error("Resolved connection provider does not match lead submission provider");
        if (connection.integrationType !== submission.source.integrationType) throw new Error("Resolved connection integration type does not match lead submission");
    }
}
