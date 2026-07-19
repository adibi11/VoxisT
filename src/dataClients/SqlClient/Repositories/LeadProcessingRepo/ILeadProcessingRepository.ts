export type ProcessIncomingLeadResult = {
    outcome: "processed" | "already_processed" | "linked_existing_external_lead";
    crmLeadId: number | null;
    externalLeadId: number | null;
};

export interface ILeadProcessingRepository {
    processCampaignLead(businessId: number, incomingLeadId: number): Promise<ProcessIncomingLeadResult>;
}
