import { IncomingLeadDto } from "../../../Types/leadIngestionTypes";

export type PersistLeadIngestionInput = {
    businessId: number;
    integrationConnectionId: number;
    provider: string;
    eventType: string;
    providerEventId?: string;
    idempotencyKey: string;
    payloadHash: string;
    rawPayload?: unknown;
    canonicalPayload: unknown;
};

export type PersistLeadIngestionResult = { outcome: "accepted" | "duplicate"; incomingLead: IncomingLeadDto };

export interface ILeadIngestionRepository {
    persistReceivedLead(input: PersistLeadIngestionInput): Promise<PersistLeadIngestionResult>;
}
