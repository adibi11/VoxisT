import {
  CaseFollowUpRequirementRecord,
  MissingCaseRequirement
} from "./caseFollowUpTypes";

export const DEFAULT_PENDING_UPLOAD_FRESH_MS = 24 * 60 * 60 * 1000;

export type CaseMissingRequirementResolverOptions = {
  pendingUploadFreshMs?: number;
};

export class CaseMissingRequirementResolver {
  private readonly pendingUploadFreshMs: number;

  constructor(options: CaseMissingRequirementResolverOptions = {}) {
    this.pendingUploadFreshMs = options.pendingUploadFreshMs ?? pendingUploadFreshMsFromEnv();
  }

  resolve(
    specifications: CaseFollowUpRequirementRecord[],
    now: Date = new Date()
  ): MissingCaseRequirement[] {
    return specifications
      .filter((specification) => specification.required)
      .filter((specification) => this.isMissing(specification, now))
      .map((specification) => ({
        specificationId: specification.id,
        label: displayLabel(specification)
      }));
  }

  private isMissing(specification: CaseFollowUpRequirementRecord, now: Date): boolean {
    if (specification.documents.some((document) =>
      document.status === "EXTRACTED" || document.status === "VERIFIED"
    )) {
      return false;
    }

    if (specification.documents.some((document) =>
      document.status === "UPLOADED" || document.status === "PROCESSING"
    )) {
      return false;
    }

    const freshUploadThreshold = now.getTime() - this.pendingUploadFreshMs;
    if (specification.documents.some((document) =>
      document.status === "PENDING_UPLOAD" &&
      document.createdAt.getTime() > freshUploadThreshold
    )) {
      return false;
    }

    return true;
  }
}

export function displayLabel(specification: CaseFollowUpRequirementRecord): string {
  return specification.label?.trim()
    || specification.schemaName.trim()
    || specification.documentTypeName.trim()
    || "מסמך נדרש";
}

export function pendingUploadFreshMsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const configuredHours = Number(env.CASE_FOLLOW_UP_PENDING_UPLOAD_FRESH_HOURS);
  return Number.isFinite(configuredHours) && configuredHours > 0
    ? configuredHours * 60 * 60 * 1000
    : DEFAULT_PENDING_UPLOAD_FRESH_MS;
}
