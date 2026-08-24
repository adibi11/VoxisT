export type CaseFollowUpDocumentStatus =
  | "PENDING_UPLOAD"
  | "UPLOADED"
  | "PROCESSING"
  | "EXTRACTED"
  | "NEEDS_REVIEW"
  | "VERIFIED"
  | "FAILED";

export type CaseFollowUpDocumentRecord = {
  status: CaseFollowUpDocumentStatus;
  createdAt: Date;
};

export type CaseFollowUpRequirementRecord = {
  id: number;
  label: string | null;
  required: boolean;
  schemaName: string;
  documentTypeName: string;
  documents: CaseFollowUpDocumentRecord[];
};

export type MissingCaseRequirement = {
  specificationId: number;
  label: string;
};

export type CaseFollowUpCaseStatus =
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "NEEDS_ATTENTION"
  | "COMPLETED";

export const ACTIVE_CASE_STATUSES: CaseFollowUpCaseStatus[] = [
  "IN_PROGRESS",
  "IN_REVIEW",
  "NEEDS_ATTENTION"
];

export function isActiveCase(status: CaseFollowUpCaseStatus, archivedAt: Date | null): boolean {
  return archivedAt === null && ACTIVE_CASE_STATUSES.includes(status);
}

export function resolveCaseClientPhone(
  clientPhoneNumber: string | null,
  leadPhoneNumber: string | null
): string | null {
  const canonical = usablePhone(clientPhoneNumber);
  return canonical ?? usablePhone(leadPhoneNumber);
}

function usablePhone(value: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized.replace(/\D/g, "").length >= 7 ? normalized : null;
}
