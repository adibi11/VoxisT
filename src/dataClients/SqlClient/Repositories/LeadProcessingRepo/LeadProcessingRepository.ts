import { PrismaClient } from "../../../../generated/prisma/client";
import { LeadCreationService } from "../../../../Lead/LeadCreationService";
import { ILeadProcessingRepository, ProcessIncomingLeadResult } from "./ILeadProcessingRepository";

export class LeadProcessingRepository implements ILeadProcessingRepository {
  private readonly leadCreation: LeadCreationService;

  constructor(prisma: PrismaClient) {
    this.leadCreation = new LeadCreationService(prisma);
  }

  processCampaignLead(businessId: number, incomingLeadId: number): Promise<ProcessIncomingLeadResult> {
    return this.leadCreation.createCampaignLead(businessId, incomingLeadId);
  }
}
