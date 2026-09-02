export type IntegrationType = "FORM" | "LANDING_PAGE" | "CUSTOM_API";
export type IntegrationConnectionStatus = "PENDING" | "ACTIVE" | "DISABLED" | "FAILED";

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
