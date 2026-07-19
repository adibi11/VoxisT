import { describe, expect, it } from "vitest";
import { CampaignLeadProcessor } from "../../src/LeadIngestion/LeadProcessor";
import { ILeadProcessingRepository, ProcessIncomingLeadResult } from "../../src/dataClients/SqlClient/Repositories/LeadProcessingRepo/ILeadProcessingRepository";

describe("CampaignLeadProcessor", () => {
    it("delegates the queue job to the tenant-scoped campaign processing transaction", async () => {
        const repository = new FakeLeadProcessingRepository();
        const processor = new CampaignLeadProcessor(repository);

        await processor.process({ businessId: 7, incomingLeadId: 41 });

        expect(repository.calls).toEqual([{ businessId: 7, incomingLeadId: 41 }]);
    });
});

class FakeLeadProcessingRepository implements ILeadProcessingRepository {
    calls: Array<{ businessId: number; incomingLeadId: number }> = [];
    async processCampaignLead(businessId: number, incomingLeadId: number): Promise<ProcessIncomingLeadResult> {
        this.calls.push({ businessId, incomingLeadId });
        return { outcome: "processed", crmLeadId: 1, externalLeadId: 2 };
    }
}
