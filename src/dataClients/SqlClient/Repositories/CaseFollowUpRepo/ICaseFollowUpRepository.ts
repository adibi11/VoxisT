import {
  CaseFollowUpCaseStatus,
  CaseFollowUpRequirementRecord
} from "../../../../CaseFollowUp/caseFollowUpTypes";

export type CaseDocumentFollowUpPolicyRecord = {
  enabled: boolean;
  timezone: string;
  hour: number | null;
};

export type CaseFollowUpCandidate = {
  caseId: number;
  businessId: number;
  status: CaseFollowUpCaseStatus;
  archivedAt: Date | null;
  clientPhoneNumber: string | null;
  leadPhoneNumber: string | null;
  smsConfigured: boolean;
  policy: CaseDocumentFollowUpPolicyRecord;
  requirements: CaseFollowUpRequirementRecord[];
};

export type CaseFollowUpWorkItem = {
  id: number;
  businessId: number;
  caseId: number;
  status: "PROCESSING";
  cadenceKey: string;
  case: {
    businessId: number;
    status: CaseFollowUpCaseStatus;
    archivedAt: Date | null;
    businessName: string;
    clientId: number | null;
    clientName: string;
    clientPhoneNumber: string | null;
    leadPhoneNumber: string | null;
    policy: CaseDocumentFollowUpPolicyRecord | null;
    requirements: CaseFollowUpRequirementRecord[];
  };
};

export type CreatePendingCaseFollowUpResult =
  | { outcome: "created"; id: number }
  | { outcome: "duplicate" };

export interface ICaseFollowUpRepository {
  listPendingIdsForEnqueue(now: Date, limit: number): Promise<number[]>;
  listSchedulerCandidates(
    afterCaseId: number | null,
    limit: number
  ): Promise<CaseFollowUpCandidate[]>;
  createPending(
    businessId: number,
    caseId: number,
    cadenceKey: string,
    scheduledFor: Date
  ): Promise<CreatePendingCaseFollowUpResult>;
  claimPending(id: number): Promise<CaseFollowUpWorkItem | null>;
  markAccepted(id: number, providerMessageId: string, acceptedAt: Date): Promise<boolean>;
  markFailed(id: number, failureCode: string, failureReason: string): Promise<boolean>;
  defer(id: number, scheduledFor: Date): Promise<boolean>;
  markSkipped(id: number, reasonCode: string, reason: string): Promise<boolean>;
}
