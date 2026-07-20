import { CreateIntegrationConnectionInput, IntegrationConnectionDto } from "../../../Types/leadIngestionTypes";

export interface IIntegrationConnectionRepository {
    create(input: CreateIntegrationConnectionInput): Promise<IntegrationConnectionDto>;
    getById(businessId: number, connectionId: number): Promise<IntegrationConnectionDto | null>;
    getByConnectionToken(connectionToken: string): Promise<IntegrationConnectionDto | null>;
    getActiveByProviderResource(provider: string, integrationType: IntegrationConnectionDto["integrationType"], externalResourceId: string, pageId?: string): Promise<IntegrationConnectionDto | null>;
    getMetaConnectionByResource(formId: string, pageId: string): Promise<IntegrationConnectionDto | null>;
    listByBusiness(businessId: number): Promise<IntegrationConnectionDto[]>;
    saveCredentials(businessId: number, connectionId: number, credentialsEncrypted: string): Promise<IntegrationConnectionDto>;
    configureMetaResource(businessId: number, connectionId: number, pageId: string, formId: string, credentialsEncrypted: string): Promise<IntegrationConnectionDto>;
    updateStatus(businessId: number, connectionId: number, status: IntegrationConnectionDto["status"]): Promise<IntegrationConnectionDto>;
    getCredentialsEncrypted(businessId: number, connectionId: number): Promise<string | null>;
}
