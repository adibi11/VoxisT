import { CaseStatusDto, DocumentStatusDto } from "../../../../contracts";

export type PortalDocumentRecord = {
  id: number;
  filename: string;
  status: DocumentStatusDto;
  createdAt: Date;
  requirementAnswer: unknown | null;
};

export type PortalRequirementRecord = {
  id: number;
  label: string | null;
  required: boolean;
  schemaName: string;
  documentTypeName: string;
  category: string | null;
  documents: PortalDocumentRecord[];
};

export type PortalCaseRecord = {
  id: number;
  businessId: number;
  name: string;
  status: CaseStatusDto;
  clientDisplayName: string;
  advisorDisplayName: string | null;
  requirements: PortalRequirementRecord[];
};

export type ResolvedPortalAccess = {
  id: number;
  tokenHash: string;
  expiresAt: Date;
  case: PortalCaseRecord;
};

export type RecoverablePortalAccessRecord = {
  id: number;
  tokenHash: string;
  tokenEncrypted: string | null;
  expiresAt: Date;
};

export type FindActivePortalAccessResult =
  | { outcome: "found"; access: RecoverablePortalAccessRecord | null }
  | { outcome: "case_not_found" };

export type CreatePortalAccessResult =
  | { outcome: "created"; access: { id: number; expiresAt: Date } }
  | { outcome: "case_not_found" };

export type RevokePortalAccessResult =
  | { outcome: "revoked"; revokedCount: number }
  | { outcome: "case_not_found" };

export interface ICasePortalAccessRepository {
  createAccess(businessId: number, caseId: number, tokenHash: string, tokenEncrypted: string, expiresAt: Date, now: Date): Promise<CreatePortalAccessResult>;
  findActiveAccessForCase(businessId: number, caseId: number, now: Date): Promise<FindActivePortalAccessResult>;
  resolveActiveAccess(tokenHash: string, now: Date): Promise<ResolvedPortalAccess | null>;
  revokeAccess(businessId: number, caseId: number, now: Date): Promise<RevokePortalAccessResult>;
}
