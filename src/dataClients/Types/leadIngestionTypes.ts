export type IntegrationType = "FORM" | "LANDING_PAGE" | "CUSTOM_API";
export type IntegrationConnectionStatus = "PENDING" | "ACTIVE" | "DISABLED" | "FAILED";
export type IncomingLeadStatus = "RECEIVED" | "QUEUED" | "PROCESSING" | "PROCESSED" | "FAILED" | "IGNORED";
export type IngestionOutboxStatus = "PENDING" | "PUBLISHED" | "FAILED";

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

export type CreateIntegrationConnectionInput =
  Omit<IntegrationConnectionDto, "id" | "hasCredentials" | "hasWebhookSecret" | "createdAt" | "updatedAt"> & {
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
