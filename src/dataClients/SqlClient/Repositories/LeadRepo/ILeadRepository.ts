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
    deleteLead(businessId: number, leadId: number): Promise<void>;
}
