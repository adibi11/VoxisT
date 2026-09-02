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

type PublicFormConfig = {
  title?: string;
  description?: string;
  submitLabel?: string;
  successMessage?: string;
  allowedOrigins?: string[];
  fields?: Array<{ key: string; label: string; type?: "text" | "email" | "tel" | "textarea"; required?: boolean }>;
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
    if ((body.integrationType === "FORM" || body.integrationType === "LANDING_PAGE") && !isValidPublicFormConfig(body.config)) {
      return res.status(400).json({ message: "Invalid public form configuration" });
    }

    try {
      const connectionToken = randomBytes(32).toString("base64url");
      const isBrowserForm = body.integrationType === "FORM" || body.integrationType === "LANDING_PAGE";
      const integrationSecret = isBrowserForm ? null : randomBytes(32).toString("base64url");
      const connection = await sql.integrationConnectionRepository.create({
        businessId,
        provider: body.provider.trim(),
        integrationType: body.integrationType,
        status: "ACTIVE",
        connectionToken,
        webhookSecretEncrypted: integrationSecret ? encryptIntegrationSecret(integrationSecret) : null,
        displayName: body.displayName?.trim() || body.provider.trim(),
        externalAccountId: null,
        externalResourceId: null,
        config: isBrowserForm ? normalizePublicFormConfig(body.config) : body.config || null
      });
      const response: Record<string, unknown> = {
        connection,
        submissionEndpoint: isBrowserForm ? `${publicApiBaseUrl(req)}/v1/public/forms/${connectionToken}/submissions` : `/v1/lead-submissions/${connectionToken}`
      };
      if (isBrowserForm) {
        response.hostedFormUrl = `${publicApiBaseUrl(req)}/v1/public/forms/${connectionToken}`;
        response.embedCode = `<iframe src="${publicApiBaseUrl(req)}/v1/public/forms/${connectionToken}" title="${escapeAttribute(connection.displayName || "Contact form")}" width="100%" height="620" style="border:0" loading="lazy"></iframe>`;
      } else {
        response.integrationSecret = integrationSecret;
        response.contract = leadSubmissionContract();
      }
      return res.status(201).json(response);
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

function normalizePublicFormConfig(config?: Record<string, unknown>): PublicFormConfig {
  const source = (config || {}) as PublicFormConfig;
  const fields = Array.isArray(source.fields) ? source.fields.filter(isValidFormField).slice(0, 30) : undefined;
  const allowedOrigins = Array.isArray(source.allowedOrigins)
    ? source.allowedOrigins.filter((value): value is string => typeof value === "string" && isValidOrigin(value)).slice(0, 20)
    : undefined;
  return {
    title: optionalText(source.title) || "Contact us",
    description: optionalText(source.description) || undefined,
    submitLabel: optionalText(source.submitLabel) || "Submit",
    successMessage: optionalText(source.successMessage) || "Thank you. Your details were received.",
    allowedOrigins,
    fields: fields?.length ? fields : [
      { key: "fullName", label: "Name", type: "text", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel", required: true }
    ]
  };
}

function isValidPublicFormConfig(config?: Record<string, unknown>): boolean {
  if (!config) return true;
  if (config.allowedOrigins !== undefined && (!Array.isArray(config.allowedOrigins) || !config.allowedOrigins.every((value) => typeof value === "string" && isValidOrigin(value)))) return false;
  if (config.fields !== undefined && (!Array.isArray(config.fields) || config.fields.length === 0 || !config.fields.every(isValidFormField))) return false;
  return true;
}

function isValidFormField(value: unknown): value is NonNullable<PublicFormConfig["fields"]>[number] {
  if (!value || typeof value !== "object") return false;
  const field = value as Record<string, unknown>;
  return typeof field.key === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,49}$/.test(field.key)
    && typeof field.label === "string" && Boolean(field.label.trim())
    && (field.type === undefined || ["text", "email", "tel", "textarea"].includes(String(field.type)));
}

function isValidOrigin(value: string): boolean {
  try { const url = new URL(value); return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value.replace(/\/$/, ""); }
  catch { return false; }
}

function optionalText(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null; }
function publicApiBaseUrl(req: express.Request): string { return (process.env.PUBLIC_API_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, ""); }
function escapeAttribute(value: string): string { return value.replace(/[&"<>]/g, (character) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[character]!); }

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
