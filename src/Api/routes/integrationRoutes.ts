import { randomBytes } from "crypto";
import express from "express";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { encryptIntegrationSecret } from "../../LeadIngestion/integrationSecret";
import { ILogger } from "../../logging/logger";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess, requireBusinessOwner } from "../authMiddleware";

type GenericIntegrationType = "FORM" | "LANDING_PAGE" | "CUSTOM_API";
type CreateIntegrationRequest = {
  provider: string;
  integrationType: GenericIntegrationType;
  displayName?: string;
  config?: Record<string, unknown>;
};

const GENERIC_INTEGRATION_TYPES = new Set<GenericIntegrationType>(["FORM", "LANDING_PAGE", "CUSTOM_API"]);

export function getIntegrationRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger): void {
  app.get("/businesses/:businessId/integrations", requireAuth, async (req, res) => {
    const businessId = parseId(req.params.businessId);
    if (!businessId || !requireBusinessAccess(req as AuthenticatedRequest, res, businessId)) return;
    const items = (await sql.integrationConnectionRepository.listByBusiness(businessId))
      .filter((connection) => GENERIC_INTEGRATION_TYPES.has(connection.integrationType as GenericIntegrationType));
    return res.json({ items });
  });

  app.post("/businesses/:businessId/integrations", requireAuth, async (req, res) => {
    const businessId = parseId(req.params.businessId);
    if (!businessId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
    const body = req.body as Partial<CreateIntegrationRequest>;
    if (!isValidCreateRequest(body)) {
      return res.status(400).json({ message: "A provider and generic integration type are required" });
    }

    try {
      const connectionToken = randomBytes(32).toString("base64url");
      const integrationSecret = randomBytes(32).toString("base64url");
      const connection = await sql.integrationConnectionRepository.create({
        businessId,
        provider: body.provider.trim(),
        integrationType: body.integrationType,
        status: "ACTIVE",
        connectionToken,
        webhookSecretEncrypted: encryptIntegrationSecret(integrationSecret),
        displayName: body.displayName?.trim() || body.provider.trim(),
        externalAccountId: null,
        externalResourceId: null,
        config: body.config || null
      });
      return res.status(201).json({
        connection,
        integrationSecret,
        submissionEndpoint: `/v1/lead-submissions/${connectionToken}`,
        contract: leadSubmissionContract()
      });
    } catch (error) {
      logger.error("integration.connection.create.failed", { businessId, error });
      return res.status(503).json({ message: "Integration connection could not be created" });
    }
  });

  app.get("/businesses/:businessId/integrations/:connectionId", requireAuth, async (req, res) => {
    const businessId = parseId(req.params.businessId);
    const connectionId = parseId(req.params.connectionId);
    if (!businessId || !connectionId || !requireBusinessAccess(req as AuthenticatedRequest, res, businessId)) return;
    const connection = await sql.integrationConnectionRepository.getById(businessId, connectionId);
    if (!connection || !GENERIC_INTEGRATION_TYPES.has(connection.integrationType as GenericIntegrationType)) {
      return res.status(404).json({ message: "Integration connection not found" });
    }
    return res.json(connection);
  });

  app.post("/businesses/:businessId/integrations/:connectionId/disable", requireAuth, async (req, res) => {
    const businessId = parseId(req.params.businessId);
    const connectionId = parseId(req.params.connectionId);
    if (!businessId || !connectionId || !requireBusinessOwner(req as AuthenticatedRequest, res, businessId)) return;
    const connection = await sql.integrationConnectionRepository.getById(businessId, connectionId);
    if (!connection || !GENERIC_INTEGRATION_TYPES.has(connection.integrationType as GenericIntegrationType)) {
      return res.status(404).json({ message: "Integration connection not found" });
    }
    await sql.integrationConnectionRepository.clearCredentials(businessId, connectionId);
    return res.json(await sql.integrationConnectionRepository.updateStatus(businessId, connectionId, "DISABLED"));
  });
}

function isValidCreateRequest(body: Partial<CreateIntegrationRequest>): body is CreateIntegrationRequest {
  return typeof body.provider === "string"
    && body.provider.trim().length > 0
    && typeof body.integrationType === "string"
    && GENERIC_INTEGRATION_TYPES.has(body.integrationType as GenericIntegrationType)
    && (body.config === undefined || (typeof body.config === "object" && body.config !== null && !Array.isArray(body.config)));
}

function parseId(value: string | string[]): number | null {
  if (Array.isArray(value)) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function leadSubmissionContract(): Record<string, unknown> {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Voxis-Integration-Secret": "<one-time secret returned when the connection is created>",
      "Idempotency-Key": "<stable producer event id>"
    },
    body: {
      schemaVersion: 1,
      source: { provider: "your-provider", integrationType: "FORM", eventType: "submission" },
      person: { fullName: "Example Person", email: "person@example.com", phone: "+15551234567" },
      answers: { fields: [] }
    }
  };
}
