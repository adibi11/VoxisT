// Persistence-independent response contracts for the future Cases API.
// No route, controller, or processing implementation depends on these yet.

export type CaseStatusDto = "IN_PROGRESS" | "IN_REVIEW" | "NEEDS_ATTENTION" | "COMPLETED";

export type DocumentStatusDto =
  | "PENDING_UPLOAD"
  | "UPLOADED"
  | "PROCESSING"
  | "EXTRACTED"
  | "NEEDS_REVIEW"
  | "VERIFIED"
  | "FAILED";

export type DocumentSourceDto =
  | "ADVISOR_UPLOAD"
  | "CLIENT_PORTAL"
  | "EMAIL"
  | "WHATSAPP"
  | "SYSTEM";

export type CaseClientDto = { id: number; displayName: string };

export type CaseAssigneeDto = {
  id: number;
  displayName: string;
  avatarUrl?: string | null;
};

export type CaseListItemDto = {
  id: number;
  name: string;
  client: CaseClientDto;
  status: CaseStatusDto;
  assignee?: CaseAssigneeDto | null;
  expectedDocuments: number;
  uploadedDocuments: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  archivedAt?: string | null;
};

export type CaseDocumentDto = {
  id: number;
  caseDocumentSpecificationId?: number | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatusDto;
  source: DocumentSourceDto;
  documentType?: { id: number; name: string; category?: string | null } | null;
  schema?: { id: number; name: string; version: number } | null;
  requirementAnswer?: unknown | null;
  uploadedAt: string;
  uploadedBy?: { id: number; displayName: string } | null;
};

export type CaseDocumentSpecificationDto = {
  id: number;
  required: boolean;
  label?: string | null;
  schema: SchemaDto;
  documentIds: number[];
  createdAt: string;
  updatedAt: string;
};

export type CaseDetailsDto = {
  id: number;
  name: string;
  client: CaseClientDto;
  status: CaseStatusDto;
  assignee?: CaseAssigneeDto | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  archivedAt?: string | null;
  documentSpecifications: CaseDocumentSpecificationDto[];
  documents: CaseDocumentDto[];
};

export type DocumentTypeDto = {
  id: number;
  businessId?: number | null;
  name: string;
  category?: string | null;
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateBusinessDocumentTypeRequestDto = {
  name: string;
  category?: string | null;
};

export type SchemaDto = {
  id: number;
  businessId?: number | null;
  isCustom: boolean;
  documentType: { id: number; name: string; category?: string | null };
  name: string;
  version: number;
  requirementSchema: unknown;
};

export type CreateBusinessSchemaRequestDto = {
  documentTypeId: number;
  name: string;
  version: number;
  requirementSchema: Record<string, unknown>;
};

export type CreateCaseRequestDto = {
  leadId: number;
  name: string;
  assigneeId?: number | null;
  documentSpecifications: Array<{
    schemaId: number;
    label?: string | null;
    required: boolean;
  }>;
};

export type CreateCaseCommentRequestDto = {
  content: string;
};

export type CaseCommentDto = {
  id: number;
  caseId: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: number;
    displayName: string | null;
    email: string;
  };
};
export type CreateDocumentUploadRequestDto = {
  caseDocumentSpecificationId: number;
  filename: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  sizeBytes: number;
};

export type DocumentUploadRequestResponseDto = {
  document: { id: number; filename: string; status: "PENDING_UPLOAD"; mimeType: string; sizeBytes: number };
  upload: { url: string; method: "PUT"; expiresInSeconds: number };
};

export type DocumentViewUrlResponseDto = {
  url: string;
  expiresInSeconds: number;
  mimeType: string;
  filename: string;
};

export type VerifyDocumentResponseDto = {
  id: number;
  status: "VERIFIED";
};

export type CaseInboundEmailAddressDto = { emailAddress: string };
