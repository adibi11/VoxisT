import express from "express";
import { LeadIngestionService } from "../../LeadIngestion/LeadIngestionService";
import { CanonicalLeadSubmission } from "../../LeadIngestion/canonicalLeadSubmission";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { ILogger } from "../../logging/logger";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess } from "../authMiddleware";

type DirectLeadSubmissionRequest = {
    externalEventId: string;
    person: CanonicalLeadSubmission["person"];
    answers?: CanonicalLeadSubmission["answers"];
    attribution?: CanonicalLeadSubmission["attribution"];
    consent?: CanonicalLeadSubmission["consent"];
    metadata?: CanonicalLeadSubmission["metadata"];
};

export function getLeadIngestionRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger): void {
    const ingestionService = new LeadIngestionService(sql.leadIngestionRepository, logger.child({ component: "LeadIngestionService" }));

    app.post("/lead-submissions/:connectionToken", requireAuth, async (req, res) => {
        const connectionTokenParam = req.params.connectionToken;
        const connectionToken = typeof connectionTokenParam === "string"
            ? connectionTokenParam.trim()
            : Array.isArray(connectionTokenParam)
                ? connectionTokenParam[0]?.trim()
                : undefined;
        if (!connectionToken) return res.status(400).json({ message: "connectionToken is required" });

        const connection = await sql.integrationConnectionRepository.getByConnectionToken(connectionToken);
        if (!connection || connection.status !== "ACTIVE") {
            return res.status(404).json({ message: "Active lead integration connection not found" });
        }
        if (!requireBusinessAccess(req as AuthenticatedRequest, res, connection.businessId)) return;

        const request = req.body as Partial<DirectLeadSubmissionRequest>;
        if (!isValidDirectLeadSubmission(request)) {
            return res.status(400).json({ message: "Invalid lead submission" });
        }

        try {
            const result = await ingestionService.ingest({
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

            logger.info("lead.directSubmission.accepted", {
                businessId: connection.businessId,
                connectionId: connection.id,
                incomingLeadId: result.incomingLeadId,
                outcome: result.outcome
            });
            return res.status(202).json({ incomingLeadId: result.incomingLeadId, duplicate: result.outcome === "duplicate" });
        } catch (error) {
            logger.error("lead.directSubmission.failed", { businessId: connection.businessId, connectionId: connection.id, error });
            return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid lead submission" });
        }
    });
}

function isValidDirectLeadSubmission(request: Partial<DirectLeadSubmissionRequest>): request is DirectLeadSubmissionRequest {
    return typeof request.externalEventId === "string" && Boolean(request.externalEventId.trim()) &&
        Boolean(request.person) &&
        (request.answers === undefined || Array.isArray(request.answers.fields));
}
