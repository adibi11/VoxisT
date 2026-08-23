import { CaseStatusDto } from "./caseContracts";

export type PortalDocumentStatus =
  | "PENDING_UPLOAD"
  | "UPLOADED"
  | "PROCESSING"
  | "EXTRACTED"
  | "NEEDS_REVIEW"
  | "FAILED";

export type ClientPortalDocumentDto = {
  id: string;
  filename: string;
  status: PortalDocumentStatus;
  uploadedAt: string | null;
  message: string | null;
};

export type ClientPortalRequirementDto = {
  id: string;
  label: string;
  documentTypeName: string | null;
  category: string | null;
  required: boolean;
  documents: ClientPortalDocumentDto[];
};

export type ClientPortalDto = {
  case: { displayName: string; status: CaseStatusDto };
  client: { displayName: string };
  advisor: { displayName: string } | null;
  requirements: ClientPortalRequirementDto[];
};

export type CreateCasePortalAccessResponseDto = {
  accessToken: string;
  expiresAt: string;
  portalUrl?: string;
};

export type PortalDocumentUploadRequestDto = {
  filename: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  sizeBytes: number;
};

export type PortalDocumentUploadResponseDto = {
  document: {
    id: string;
    filename: string;
    status: "PENDING_UPLOAD";
    mimeType: string;
    sizeBytes: number;
  };
  upload: { url: string; method: "PUT"; expiresInSeconds: number };
};
