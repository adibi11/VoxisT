import {
  CaseCommentDto,
  CaseDetailsDto,
  CaseListItemDto,
  CreateCaseCommentRequestDto,
  CreateCaseRequestDto
} from "../../../../contracts";

export type CreateCaseResult =
  | { outcome: "created"; case: CaseDetailsDto }
  | { outcome: "lead_not_found" }
  | { outcome: "assignee_not_found" }
  | { outcome: "schemas_not_found"; schemaIds: number[] };

export interface ICaseRepository {
  createCase(businessId: number, request: CreateCaseRequestDto): Promise<CreateCaseResult>;
  listCases(businessId: number): Promise<CaseListItemDto[]>;
  getCaseDetails(businessId: number, caseId: number): Promise<CaseDetailsDto | null>;
  createComment(
    businessId: number,
    caseId: number,
    authorUserId: number,
    request: CreateCaseCommentRequestDto
  ): Promise<CaseCommentDto | null>;
  getComments(businessId: number, caseId: number): Promise<CaseCommentDto[] | null>;
}
