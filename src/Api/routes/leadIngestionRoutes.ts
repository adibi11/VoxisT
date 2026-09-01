import { timingSafeEqual } from "crypto";
import express, { RequestHandler } from "express";
import { LeadIngestionService } from "../../LeadIngestion/LeadIngestionService";
import { CanonicalLeadSubmission } from "../../LeadIngestion/canonicalLeadSubmission";
import { decryptIntegrationSecret } from "../../LeadIngestion/integrationSecret";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { ILogger } from "../../logging/logger";

type DirectLeadSubmissionRequest = {
    externalEventId: string;
    person: CanonicalLeadSubmission["person"];
    answers?: CanonicalLeadSubmission["answers"];
    attribution?: CanonicalLeadSubmission["attribution"];
    consent?: CanonicalLeadSubmission["consent"];
    metadata?: CanonicalLeadSubmission["metadata"];
};


export function getLeadIngestionRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger,publicEntrypointRateLimiter: RequestHandler): void {
    const ingestionService = new LeadIngestionService(sql.leadIngestionRepository, logger.child({ component: "LeadIngestionService" }));

    app.post("/lead-submissions/:connectionToken",publicEntrypointRateLimiter, async (req, res) => {
        const connectionToken = connectionTokenFrom(req.params.connectionToken);
        if (!connectionToken) return res.status(400).json({ message: "connectionToken is required" });
        const connection = await sql.integrationConnectionRepository.getByConnectionToken(connectionToken);
        if (!connection || connection.status !== "ACTIVE") {
            return res.status(404).json({ message: "Active lead integration connection not found" });
        }

        const providedSecret = req.header("X-Voxis-Integration-Secret");
        const encryptedSecret = await sql.integrationConnectionRepository.getWebhookSecretEncryptedByConnectionToken(connectionToken);
        try {
            if (!providedSecret || !encryptedSecret || !safeEquals(providedSecret, decryptIntegrationSecret(encryptedSecret))) {
                return res.status(401).json({ message: "Invalid integration secret" });
            }
        } catch {
            return res.status(401).json({ message: "Invalid integration secret" });
        }

        return ingestSubmission(req, res, connection as Parameters<typeof ingestSubmission>[2], ingestionService, logger);
    });

    async function ingestSubmission(req: express.Request, res: express.Response, connection: { id: number; businessId: number; provider: string; integrationType: CanonicalLeadSubmission["source"]["integrationType"] }, service: LeadIngestionService, requestLogger: ILogger) {
        const request = req.body as Partial<DirectLeadSubmissionRequest>;
        if (!isValidDirectLeadSubmission(request)) {
            return res.status(400).json({ message: "Invalid lead submission" });
        }

        try {
            const result = await service.ingest({
                connection: {
                    connectionId: connection.id,
                    businessId: connection.businessId,
                    provider: connection.provider,
                    integrationType: connection.integrationType
                },
                submission: {
                    schemaVersion: 1,
                    source: {
                        provider: connection.provider,
                        integrationType: connection.integrationType,
                        eventType: "direct.lead.submitted",
                        externalEventId: request.externalEventId.trim(),
                        receivedAt: new Date().toISOString()
                    },
                    person: request.person,
                    answers: request.answers || { fields: [] },
                    attribution: request.attribution,
                    consent: request.consent,
                    metadata: request.metadata
                },
                rawPayload: req.body
            });

            requestLogger.info("lead.directSubmission.accepted", {
                businessId: connection.businessId,
                connectionId: connection.id,
                incomingLeadId: result.incomingLeadId,
                outcome: result.outcome
            });
            return res.status(202).json({ incomingLeadId: result.incomingLeadId, duplicate: result.outcome === "duplicate" });
        } catch (error) {
            requestLogger.error("lead.directSubmission.failed", { businessId: connection.businessId, connectionId: connection.id, error });
            return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid lead submission" });
        }
    }
}

function connectionTokenFrom(value: unknown): string | undefined {
    return typeof value === "string" ? value.trim() : Array.isArray(value) ? value[0]?.trim() : undefined;
}

function safeEquals(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left); const rightBytes = Buffer.from(right);
    return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function isValidDirectLeadSubmission(request: Partial<DirectLeadSubmissionRequest>): request is DirectLeadSubmissionRequest {
    return typeof request.externalEventId === "string" && Boolean(request.externalEventId.trim()) &&
        Boolean(request.person) &&
        (request.answers === undefined || Array.isArray(request.answers.fields));
}
