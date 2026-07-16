import {
    CreateManualLeadRequestDto,
    LeadDto,
    LeadSummaryDto,
    UpdateLeadRequestDto
} from "../../../../contracts";

export interface ILeadRepository {
    getLeadsByBusiness(businessId: number): Promise<LeadSummaryDto[]>;
    getLeadById(businessId: number, leadId: number): Promise<LeadDto | null>;
    createManualLead(businessId: number, leadDto: CreateManualLeadRequestDto): Promise<LeadDto>;
    updateLead(businessId: number, leadId: number, leadDto: UpdateLeadRequestDto): Promise<LeadDto>;
    compareAndSetAssignee(
        businessId: number,
        leadId: number,
        expectedMemberId: number | null,
        memberId: number | null
    ): Promise<LeadAssignmentResult>;
    deleteLead(businessId: number, leadId: number): Promise<void>;
}

export type LeadAssignmentResult =
    | { outcome: "updated"; lead: LeadDto }
    | { outcome: "not_found" }
    | { outcome: "conflict"; lead: LeadDto };
