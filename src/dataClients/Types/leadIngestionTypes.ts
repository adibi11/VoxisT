export type IntegrationType = "LEAD_ADS" | "FORM" | "LANDING_PAGE" | "CUSTOM_API" | "MESSAGING";
export type IntegrationConnectionStatus = "PENDING" | "ACTIVE" | "DISABLED" | "FAILED";
export type IncomingLeadStatus = "RECEIVED" | "QUEUED" | "PROCESSING" | "PROCESSED" | "FAILED" | "IGNORED";
export type IngestionOutboxStatus = "PENDING" | "PUBLISHED" | "FAILED";
export type ProviderWebhookEventStatus = "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED" | "IGNORED";

export type IntegrationConnectionDto = {
    id: number;
    businessId: number;
    provider: string;
    integrationType: IntegrationType;
    status: IntegrationConnectionStatus;
    connectionToken: string;
    displayName: string | null;
    externalAccountId: string | null;
    externalResourceId: string | null;
    config: unknown;
    hasCredentials: boolean;
    hasWebhookSecret: boolean;
    createdAt: string;
    updatedAt: string;
};

export type CreateIntegrationConnectionInput = Omit<IntegrationConnectionDto, "id" | "hasCredentials" | "hasWebhookSecret" | "createdAt" | "updatedAt"> & {
    credentialsEncrypted?: string | null;
    webhookSecretEncrypted?: string | null;
};

export type CreateIncomingLeadInput = {
    businessId: number;
    integrationConnectionId: number;
    provider: string;
    eventType: string;
    providerEventId?: string | null;
    idempotencyKey: string;
    payloadHash: string;
    rawPayload?: unknown;
    canonicalPayload: unknown;
};

export type IncomingLeadDto = CreateIncomingLeadInput & {
    id: number;
    status: IncomingLeadStatus;
    failureCode: string | null;
    failureDetail: string | null;
    receivedAt: string;
    processedAt: string | null;
    externalLeadId: number | null;
};

export type CreateExternalLeadInput = {
    businessId: number;
    integrationConnectionId: number;
    leadId: number;
    provider: string;
    externalLeadId: string;
    externalContactId?: string | null;
    metadata?: unknown;
};

export type ExternalLeadDto = CreateExternalLeadInput & {
    id: number;
    firstReceivedAt: string;
    lastReceivedAt: string;
};

export type CreateLeadAttributionInput = {
    leadId: number;
    provider?: string | null;
    campaignExternalId?: string | null;
    campaignName?: string | null;
    formExternalId?: string | null;
    formName?: string | null;
    adExternalId?: string | null;
    adSetExternalId?: string | null;
    landingPageUrl?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    utmTerm?: string | null;
    referrer?: string | null;
    raw?: unknown;
};

export type LeadAttributionDto = CreateLeadAttributionInput & { id: number; createdAt: string };

export type CreateIngestionOutboxInput = {
    businessId: number;
    aggregateType: string;
    aggregateId: number;
    eventType: string;
    payload: unknown;
    availableAt?: Date;
};

export type IngestionOutboxDto = CreateIngestionOutboxInput & {
    id: number;
    status: IngestionOutboxStatus;
    attempts: number;
    publishedAt: string | null;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ProviderWebhookEventDto = {
    id: number;
    businessId: number;
    integrationConnectionId: number;
    provider: string;
    eventType: string;
    providerEventId: string;
    payloadHash: string;
    payload: unknown;
    status: ProviderWebhookEventStatus;
    receivedAt: string;
};
