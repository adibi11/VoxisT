import { CreateIntegrationConnectionInput, IntegrationConnectionDto } from "../../../Types/leadIngestionTypes";

export interface IIntegrationConnectionRepository {
    create(input: CreateIntegrationConnectionInput): Promise<IntegrationConnectionDto>;
    getById(businessId: number, connectionId: number): Promise<IntegrationConnectionDto | null>;
    getByConnectionId(connectionId: number): Promise<IntegrationConnectionDto | null>;
    getByConnectionToken(connectionToken: string): Promise<IntegrationConnectionDto | null>;
    getWebhookSecretEncryptedByConnectionToken(connectionToken: string): Promise<string | null>;
    listByBusiness(businessId: number): Promise<IntegrationConnectionDto[]>;
    updateStatus(businessId: number, connectionId: number, status: IntegrationConnectionDto["status"]): Promise<IntegrationConnectionDto>;
    clearCredentials(businessId: number, connectionId: number): Promise<IntegrationConnectionDto>;
}
