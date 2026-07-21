import { decryptMetaCredentials } from "../MetaLeadAds/metaOAuthService";
import { IIntegrationConnectionRepository } from "../dataClients/SqlClient/Repositories/IntegrationConnectionRepo/IIntegrationConnectionRepository";
import { ProviderWebhookEventDto } from "../dataClients/Types/leadIngestionTypes";
import { CanonicalLeadField, CanonicalLeadSubmission } from "../LeadIngestion/canonicalLeadSubmission";
import { LeadIngestionService } from "../LeadIngestion/LeadIngestionService";
import { IProviderEventHandler, ProviderEventHandlingError } from "./ProviderEventProcessor";

type MetaFieldData = { name?: unknown; values?: unknown };
type MetaLead = { id?: unknown; created_time?: unknown; field_data?: MetaFieldData[]; form_id?: unknown; campaign_id?: unknown; campaign_name?: unknown; ad_id?: unknown; ad_name?: unknown; adset_id?: unknown };

export class MetaLeadHydrator implements IProviderEventHandler {
    constructor(private readonly connections: IIntegrationConnectionRepository, private readonly ingestion: LeadIngestionService) {}

    supports(event: ProviderWebhookEventDto): boolean { return event.provider === "meta" && event.eventType === "leadgen"; }

    async handle(event: ProviderWebhookEventDto): Promise<void> {
        const leadgenId = readLeadgenId(event);
        const connection = await this.connections.getById(event.businessId, event.integrationConnectionId);
        if (!connection || connection.status !== "ACTIVE" || connection.provider !== "meta" || connection.integrationType !== "LEAD_ADS") {
            throw new ProviderEventHandlingError("Meta integration connection is unavailable", false, "META_CONNECTION_UNAVAILABLE");
        }
        const encryptedCredentials = await this.connections.getCredentialsEncrypted(event.businessId, event.integrationConnectionId);
        if (!encryptedCredentials) 
            throw new ProviderEventHandlingError("Meta Page access token is unavailable", false, "META_PAGE_TOKEN_UNAVAILABLE");
        const pageId = readPageId(event);
        const credentials = decryptMetaCredentials(encryptedCredentials);
        const pageAccessToken = credentials.pageAccessTokens?.[pageId] || credentials.pageAccessToken;
        if (!pageAccessToken) 
            throw new ProviderEventHandlingError("Meta Page access token has not been selected", false, "META_PAGE_TOKEN_UNAVAILABLE");
        const lead = await fetchMetaLead(leadgenId, pageAccessToken);
        const submission = toCanonicalLead(event, lead, leadgenId);
        await this.ingestion.ingest({
            connection: { connectionId: connection.id, businessId: connection.businessId, provider: "meta", integrationType: "LEAD_ADS" },
            submission,
            rawPayload: { webhookEvent: event.payload, metaLead: lead }
        });
    }
}

async function fetchMetaLead(leadgenId: string, accessToken: string): Promise<MetaLead> {
    const version = process.env.META_GRAPH_API_VERSION?.trim();
    if (!version) throw new ProviderEventHandlingError("META_GRAPH_API_VERSION is not configured", false, "META_NOT_CONFIGURED");
    const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(leadgenId)}`);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("fields", "id,created_time,field_data,form_id,campaign_id,campaign_name,ad_id,ad_name,adset_id");
    let response: Response;
    try { response = await fetch(url); }
    catch (error) { throw new ProviderEventHandlingError(error instanceof Error ? error.message : "Meta lead request failed", true, "META_NETWORK_ERROR"); }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
        const message = metaErrorMessage(payload) || `Meta lead request failed with status ${response.status}`;
        const retryable = response.status === 429 || response.status >= 500;
        throw new ProviderEventHandlingError(message, retryable, retryable ? "META_TRANSIENT_ERROR" : "META_LEAD_FETCH_FAILED");
    }
    if (!isMetaLead(payload)) {
        throw new ProviderEventHandlingError("Meta lead response is invalid", false, "META_LEAD_RESPONSE_INVALID");
    }
    return payload;
}

function toCanonicalLead(event: ProviderWebhookEventDto, lead: MetaLead, leadgenId: string): CanonicalLeadSubmission {
    const fields = (lead.field_data || []).flatMap((field): CanonicalLeadField[] => {
        const key = stringValue(field.name); const values = Array.isArray(field.values) ? field.values.filter((value): value is string | number | boolean => typeof value === "string" || typeof value === "number" || typeof value === "boolean") : [];
        return key ? [{ key, label: key, value: values.map(String).join(", ") || null, valueType: "text" }] : [];
    });
    const text = (name: string): string | undefined => {
        const value = fields.find((field) => field.key.toLowerCase() === name)?.value;
        return typeof value === "string" && value.trim() ? value.trim() : undefined;
    };
    
    return {
        schemaVersion: 1,
        source: { provider: "meta", integrationType: "LEAD_ADS", eventType: "leadgen", externalEventId: `leadgen:${leadgenId}`, externalLeadId: leadgenId, occurredAt: stringValue(lead.created_time) || undefined, receivedAt: event.receivedAt },
        person: {  fullName: text("full_name"), firstName: text("first_name"), lastName: text("last_name"), email: text("email"), phone: text("phone_number") || text("phone") || text("mobile_phone") },
        answers: { fields },
        attribution: { campaign: { externalId: stringValue(lead.campaign_id) || undefined, name: stringValue(lead.campaign_name) || undefined }, form: { externalId: stringValue(lead.form_id) || undefined }, ad: { externalId: stringValue(lead.ad_id) || undefined, name: stringValue(lead.ad_name) || undefined, adSetExternalId: stringValue(lead.adset_id) || undefined } },
        metadata: { providerData: { metaLeadId: leadgenId } }
    };
}

function readLeadgenId(event: ProviderWebhookEventDto): string {
    const payload = event.payload as { leadgen?: { leadgenId?: unknown } } | null;
    const leadgenId = stringValue(payload?.leadgen?.leadgenId);
    if (!leadgenId) throw new ProviderEventHandlingError("Meta webhook event has no leadgen ID", false, "META_EVENT_INVALID");
    return leadgenId;
}
function readPageId(event: ProviderWebhookEventDto): string {
    const payload = event.payload as { leadgen?: { pageId?: unknown } } | null;
    const pageId = stringValue(payload?.leadgen?.pageId);
    if (!pageId) throw new ProviderEventHandlingError("Meta webhook event has no Page ID", false, "META_EVENT_INVALID");
    return pageId;
}
function stringValue(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

function metaErrorMessage(payload: unknown): string | null {
    if (!isRecord(payload) || !isRecord(payload.error)) return null;
    return stringValue(payload.error.message);
}

function isMetaLead(value: unknown): value is MetaLead {
    return isRecord(value) && typeof value.id === "string" && (value.field_data === undefined || Array.isArray(value.field_data));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
