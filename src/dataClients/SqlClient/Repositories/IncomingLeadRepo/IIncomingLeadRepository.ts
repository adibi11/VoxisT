import { CreateIncomingLeadInput, IncomingLeadDto, IncomingLeadStatus } from "../../../Types/leadIngestionTypes";

export interface IIncomingLeadRepository {
    create(input: CreateIncomingLeadInput): Promise<IncomingLeadDto>;
    getById(businessId: number, incomingLeadId: number): Promise<IncomingLeadDto | null>;
    getByIdempotencyKey(integrationConnectionId: number, idempotencyKey: string): Promise<IncomingLeadDto | null>;
    updateStatus(businessId: number, incomingLeadId: number, status: IncomingLeadStatus, failure?: { code: string; detail?: string }): Promise<IncomingLeadDto>;
}
