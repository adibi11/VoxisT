import { MetaLeadFormSubscriptionDto } from "../../../Types/leadIngestionTypes";

export interface IMetaLeadFormSubscriptionRepository {
    listByConnection(integrationConnectionId: number): Promise<MetaLeadFormSubscriptionDto[]>;
    getActiveByPageAndForm(pageId: string, formId: string): Promise<MetaLeadFormSubscriptionDto | null>;
    upsert(input: Omit<MetaLeadFormSubscriptionDto, "id" | "status" | "createdAt" | "updatedAt">): Promise<MetaLeadFormSubscriptionDto>;
    disable(id: number, integrationConnectionId: number): Promise<MetaLeadFormSubscriptionDto | null>;
    disableAll(integrationConnectionId: number): Promise<void>;
    countActiveByPage(integrationConnectionId: number, pageId: string): Promise<number>;
}
