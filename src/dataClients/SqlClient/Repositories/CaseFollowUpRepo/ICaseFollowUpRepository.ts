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
    lastBorrowerInteractionAt: Date | null;
    firstSuccessfulFollowUpAt: Date | null;
    voiceSubmissionUnresolved: boolean;
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

export type RecoverableCaseFollowUp = {
  id: number;
  attemptCount: number;
};

export interface ICaseFollowUpRepository {
  listPendingIdsForEnqueue(now: Date, limit: number): Promise<number[]>;
  recoverAbandoned(now: Date, limit: number): Promise<RecoverableCaseFollowUp[]>;
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
  claimPending(id: number, leaseId: string, leaseExpiresAt: Date): Promise<CaseFollowUpWorkItem | null>;
  reloadClaimed(id: number, leaseId: string, now: Date): Promise<CaseFollowUpWorkItem | null>;
  markDispatchStarted(id: number, leaseId: string, startedAt: Date): Promise<boolean>;
  selectDispatchPath(id: number, leaseId: string, channel: "sms" | "voice", provider: string): Promise<boolean>;
  markAccepted(id: number, leaseId: string, providerMessageId: string, acceptedAt: Date): Promise<boolean>;
  markFailed(id: number, leaseId: string, failureCode: string, failureReason: string): Promise<boolean>;
  defer(id: number, leaseId: string, scheduledFor: Date): Promise<boolean>;
  markSkipped(id: number, leaseId: string, reasonCode: string, reason: string): Promise<boolean>;
}
