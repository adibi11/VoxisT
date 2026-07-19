import { CreateExternalLeadInput, CreateLeadAttributionInput, ExternalLeadDto, LeadAttributionDto } from "../../../Types/leadIngestionTypes";

export interface IExternalLeadRepository {
    create(input: CreateExternalLeadInput): Promise<ExternalLeadDto>;
    getByExternalId(integrationConnectionId: number, externalLeadId: string): Promise<ExternalLeadDto | null>;
    createAttribution(businessId: number, input: CreateLeadAttributionInput): Promise<LeadAttributionDto>;
}
