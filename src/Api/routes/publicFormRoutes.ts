import { randomUUID } from "crypto";
import express, { RequestHandler } from "express";
import { LeadCreationService } from "../../Lead/LeadCreationService";
import { CanonicalLeadField, CanonicalLeadSubmission } from "../../LeadIngestion/canonicalLeadSubmission";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { IntegrationConnectionDto } from "../../dataClients/Types/leadIngestionTypes";
import { ILogger } from "../../logging/logger";

type FormField = { key: string; label: string; type: "text" | "email" | "tel" | "textarea"; required: boolean };
type PublicFormConfig = {
  title: string;
  description?: string;
  submitLabel: string;
  successMessage: string;
  allowedOrigins: string[];
  fields: FormField[];
};

export function getPublicFormRoutes(
  app: express.Router,
  sql: IDatabaseClient,
  logger: ILogger,
  publicEntrypointRateLimiter: RequestHandler
): void {
  const leadCreation = new LeadCreationService(sql.getPrismaClient());

  app.get("/public/forms/:connectionToken", async (req, res) => {
    const connection = await activeFormConnection(sql, req.params.connectionToken);
    if (!connection) return res.status(404).type("text").send("Form not found");
    const config = readFormConfig(connection.config);
    applyFormSecurityHeaders(res, config);
    return res.status(200).type("html").send(renderForm(connection.connectionToken, config, randomUUID()));
  });

  app.get("/public/forms/:connectionToken/config", async (req, res) => {
    const connection = await activeFormConnection(sql, req.params.connectionToken);
    if (!connection) return res.status(404).json({ message: "Form not found" });
    const config = readFormConfig(connection.config);
    applyFormSecurityHeaders(res, config);
    return res.json({ id: connection.connectionToken, ...config });
  });

  app.post("/public/forms/:connectionToken/submissions", publicEntrypointRateLimiter, async (req, res) => {
    const connection = await activeFormConnection(sql, req.params.connectionToken);
    if (!connection) return res.status(404).json({ message: "Form not found" });
    const config = readFormConfig(connection.config);
    applyFormSecurityHeaders(res, config);

    if (typeof req.body?.website === "string" && req.body.website.trim()) {
      return sendSuccess(req, res, config.successMessage);
    }

    try {
      const submission = buildSubmission(connection, config, req.body, req.get("referer"));
      const result = await leadCreation.createIntegratedLead(connection, submission);
      logger.info("publicForm.lead.created", {
        businessId: connection.businessId,
        connectionId: connection.id,
        leadId: result.leadId,
        outcome: result.outcome
      });
      return sendSuccess(req, res, config.successMessage);
    } catch (error) {
      logger.warn("publicForm.submission.rejected", { connectionId: connection.id, error });
      return res.status(400).type("html").send(renderMessagePage("Submission could not be accepted. Please check the form and try again."));
    }
  });
}

async function activeFormConnection(sql: IDatabaseClient, tokenValue: unknown): Promise<IntegrationConnectionDto | null> {
  const token = typeof tokenValue === "string" ? tokenValue.trim() : "";
  if (!token) return null;
  const connection = await sql.integrationConnectionRepository.getByConnectionToken(token);
  return connection && connection.status === "ACTIVE" && (connection.integrationType === "FORM" || connection.integrationType === "LANDING_PAGE")
    ? connection
    : null;
}

export function readFormConfig(value: unknown): PublicFormConfig {
  const config = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const configuredFields = Array.isArray(config.fields) ? config.fields.map(readField).filter((field): field is FormField => Boolean(field)) : [];
  return {
    title: text(config.title, "Contact us"),
    description: optionalText(config.description),
    submitLabel: text(config.submitLabel, "Submit"),
    successMessage: text(config.successMessage, "Thank you. Your details were received."),
    allowedOrigins: Array.isArray(config.allowedOrigins) ? config.allowedOrigins.filter((item): item is string => typeof item === "string" && validOrigin(item)) : [],
    fields: configuredFields.length ? configuredFields : defaultFields()
  };
}

function readField(value: unknown): FormField | null {
  if (!value || typeof value !== "object") return null;
  const field = value as Record<string, unknown>;
  if (typeof field.key !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,49}$/.test(field.key) || typeof field.label !== "string" || !field.label.trim()) return null;
  const type = ["text", "email", "tel", "textarea"].includes(String(field.type)) ? field.type as FormField["type"] : "text";
  return { key: field.key, label: field.label.trim().slice(0, 100), type, required: field.required === true };
}

function buildSubmission(
  connection: IntegrationConnectionDto,
  config: PublicFormConfig,
  body: unknown,
  referrer?: string
): CanonicalLeadSubmission {
  const values = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const fields: CanonicalLeadField[] = config.fields.map((field) => {
    const rawValue = values[field.key];
    const value = typeof rawValue === "string" ? rawValue.trim().slice(0, 5000) : "";
    if (field.required && !value) throw new Error(`${field.label} is required`);
    return { key: field.key, label: field.label, value, valueType: "text" };
  });
  const valueFor = (key: string) => fields.find((field) => field.key === key)?.value as string | undefined;
  const externalEventId = typeof values.submissionId === "string" && values.submissionId.trim() ? values.submissionId.trim().slice(0, 200) : randomUUID();
  return {
    schemaVersion: 1,
    source: {
      provider: connection.provider,
      integrationType: connection.integrationType,
      eventType: "public.form.submitted",
      externalEventId,
      receivedAt: new Date().toISOString()
    },
    person: {
      fullName: valueFor("fullName") || valueFor("name"),
      firstName: valueFor("firstName"),
      lastName: valueFor("lastName"),
      email: valueFor("email"),
      phone: valueFor("phone") || valueFor("phoneNumber")
    },
    answers: { fields },
    attribution: { form: { externalId: connection.connectionToken, name: connection.displayName || undefined }, landingPageUrl: referrer, referrer }
  };
}

function renderForm(token: string, config: PublicFormConfig, submissionId: string): string {
  const fields = config.fields.map((field) => {
    const input = field.type === "textarea"
      ? `<textarea id="${escapeHtml(field.key)}" name="${escapeHtml(field.key)}"${field.required ? " required" : ""}></textarea>`
      : `<input id="${escapeHtml(field.key)}" name="${escapeHtml(field.key)}" type="${field.type}"${field.required ? " required" : ""}>`;
    return `<label for="${escapeHtml(field.key)}">${escapeHtml(field.label)}</label>${input}`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(config.title)}</title>${styles()}</head><body><main><h1>${escapeHtml(config.title)}</h1>${config.description ? `<p>${escapeHtml(config.description)}</p>` : ""}<form method="post" action="/v1/public/forms/${encodeURIComponent(token)}/submissions"><input type="hidden" name="submissionId" value="${escapeHtml(submissionId)}"><div class="trap" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>${fields}<button type="submit">${escapeHtml(config.submitLabel)}</button></form></main></body></html>`;
}

function sendSuccess(req: express.Request, res: express.Response, message: string) {
  if (req.is("application/json")) return res.status(201).json({ message });
  return res.status(201).type("html").send(renderMessagePage(message));
}

function renderMessagePage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles()}</head><body><main><p class="message">${escapeHtml(message)}</p></main></body></html>`;
}

function applyFormSecurityHeaders(res: express.Response, config: PublicFormConfig): void {
  const ancestors = config.allowedOrigins.length ? config.allowedOrigins.join(" ") : "*";
  res.removeHeader("X-Frame-Options");
  res.setHeader("Content-Security-Policy", `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors ${ancestors}; base-uri 'none'`);
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store");
}

function defaultFields(): FormField[] { return [{ key: "fullName", label: "Name", type: "text", required: true }, { key: "email", label: "Email", type: "email", required: false }, { key: "phone", label: "Phone", type: "tel", required: true }]; }
function text(value: unknown, fallback: string): string { return optionalText(value) || fallback; }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined; }
function validOrigin(value: string): boolean { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && url.origin === value.replace(/\/$/, ""); } catch { return false; } }
function escapeHtml(value: string): string { return value.replace(/[&"'<>]/g, (character) => ({ "&": "&amp;", '"': "&quot;", "'": "&#39;", "<": "&lt;", ">": "&gt;" })[character]!); }
function styles(): string { return `<style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#172033;font:16px/1.5 system-ui,sans-serif}main{max-width:640px;margin:auto;padding:24px}h1{font-size:1.75rem;margin:0 0 8px}p{color:#536079}form{display:grid;gap:10px;margin-top:20px}label{font-weight:600}input,textarea{width:100%;padding:12px;border:1px solid #c9d1df;border-radius:8px;font:inherit}textarea{min-height:110px;resize:vertical}button{margin-top:10px;padding:13px;border:0;border-radius:8px;background:#3157d5;color:#fff;font:inherit;font-weight:700;cursor:pointer}.trap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}.message{text-align:center;margin-top:100px;font-size:1.15rem}</style>`; }
