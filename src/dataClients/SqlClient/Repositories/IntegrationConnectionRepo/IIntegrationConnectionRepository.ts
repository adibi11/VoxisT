import { CreateIntegrationConnectionInput, IntegrationConnectionDto } from "../../../Types/leadIngestionTypes";

export interface IIntegrationConnectionRepository {
    create(input: CreateIntegrationConnectionInput): Promise<IntegrationConnectionDto>;
    getById(businessId: number, connectionId: number): Promise<IntegrationConnectionDto | null>;
    getByConnectionToken(connectionToken: string): Promise<IntegrationConnectionDto | null>;
}
