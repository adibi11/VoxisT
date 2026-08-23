import { createHmac } from "crypto";
import {
  ClientPortalDto,
  ClientPortalDocumentDto,
  PortalDocumentStatus
} from "../contracts";
import {
  PortalCaseRecord,
  PortalDocumentRecord,
  PortalRequirementRecord
} from "../dataClients/SqlClient/Repositories/CasePortalAccessRepo/ICasePortalAccessRepository";

export function mapClientPortal(caseRecord: PortalCaseRecord, tokenHash: string): ClientPortalDto {
  return {
    case: { displayName: caseRecord.name, status: caseRecord.status },
    client: { displayName: caseRecord.clientDisplayName },
    advisor: caseRecord.advisorDisplayName
      ? { displayName: caseRecord.advisorDisplayName }
      : null,
    requirements: caseRecord.requirements.map((requirement) => ({
      id: portalResourceId(tokenHash, "requirement", requirement.id),
      label: requirement.label?.trim()
        || requirement.schemaName.trim()
        || requirement.documentTypeName.trim(),
      documentTypeName: requirement.documentTypeName || null,
      category: requirement.category,
      required: requirement.required,
      documents: requirement.documents.map((document) => mapDocument(document, tokenHash))
    }))
  };
}

export function findRequirementByPublicId(
  caseRecord: PortalCaseRecord,
  tokenHash: string,
  publicId: string
): PortalRequirementRecord | null {
  return caseRecord.requirements.find((requirement) =>
    portalResourceId(tokenHash, "requirement", requirement.id) === publicId
  ) ?? null;
}

export function findDocumentByPublicId(
  caseRecord: PortalCaseRecord,
  tokenHash: string,
  publicId: string
): PortalDocumentRecord | null {
  for (const requirement of caseRecord.requirements) {
    const document = requirement.documents.find((candidate) =>
      portalResourceId(tokenHash, "document", candidate.id) === publicId
    );
    if (document) return document;
  }
  return null;
}

export function portalResourceId(
  tokenHash: string,
  kind: "requirement" | "document",
  internalId: number
): string {
  const prefix = kind === "requirement" ? "req" : "doc";
  const digest = createHmac("sha256", tokenHash)
    .update(`portal:${kind}:${internalId}`)
    .digest("base64url");
  return `${prefix}_${digest}`;
}

function mapDocument(document: PortalDocumentRecord, tokenHash: string): ClientPortalDocumentDto {
  return {
    id: portalResourceId(tokenHash, "document", document.id),
    filename: document.filename,
    status: mapStatus(document.status),
    uploadedAt: document.status === "PENDING_UPLOAD" ? null : document.createdAt.toISOString(),
    message: safeDocumentMessage(document)
  };
}

function mapStatus(status: PortalDocumentRecord["status"]): PortalDocumentStatus {
  return status === "VERIFIED" ? "EXTRACTED" : status;
}

function safeDocumentMessage(document: PortalDocumentRecord): string | null {
  if (document.status === "FAILED") {
    return "We couldn't process this document. Please try uploading it again.";
  }
  if (document.status !== "NEEDS_REVIEW") return null;
  if (isRecord(document.requirementAnswer)
    && isRecord(document.requirementAnswer.documentMatch)
    && document.requirementAnswer.documentMatch.matches === false) {
    return "The uploaded file may not match the requested document.";
  }
  return "This document needs review. Please check it and try uploading it again if necessary.";
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
