import { ILeadProcessingRepository } from "../dataClients/SqlClient/Repositories/LeadProcessingRepo/ILeadProcessingRepository";

export type LeadIngestionJobData = { incomingLeadId: number; businessId: number };

/**
 * CRM lead creation is intentionally deferred to the next milestone. The worker
 * depends on this port so queue reliability remains independent from CRM policy.
 */
export interface ILeadProcessor {
    process(job: LeadIngestionJobData): Promise<void>;
}

export class CampaignLeadProcessor implements ILeadProcessor {
    constructor(private readonly repository: ILeadProcessingRepository) {}

    async process(job: LeadIngestionJobData): Promise<void> {
        await this.repository.processCampaignLead(job.businessId, job.incomingLeadId);
    }
}
