import { DocumentRequirementAnswer } from "../../../../Documents/documentProcessingTypes";

export type DocumentUploadContext = { caseId: number; schemaId: number; documentTypeId: number };
export type PendingDocumentInput = DocumentUploadContext & {
  id: number;
  caseDocumentSpecificationId: number; filename: string; storageKey: string;
  mimeType: string; sizeBytes: number; uploadedById: number | null; source: "ADVISOR_UPLOAD" | "CLIENT_PORTAL";
};
export type PendingDocument = {
  id: number; filename: string; status: "PENDING_UPLOAD"; mimeType: string; sizeBytes: number;
};
export type DocumentStorageRecord = {
  id: number;
  status: "PENDING_UPLOAD" | "UPLOADED" | "PROCESSING" | "EXTRACTED" | "NEEDS_REVIEW" | "VERIFIED" | "FAILED";
};
export type ViewableDocument = {
  id: number;
  storageKey: string;
  filename: string;
  mimeType: string;
};
export type ProcessingDocument = {
  id: number;
  storageKey: string;
  filename: string;
  mimeType: string;
  schemaName: string;
  documentTypeName: string;
  requirementSchema: unknown;
};
export interface IDocumentRepository {
  reserveDocumentId(): Promise<number>;
  getUploadContext(businessId: number, caseId: number, specificationId: number): Promise<DocumentUploadContext | null>;
  createPendingDocument(input: PendingDocumentInput): Promise<PendingDocument>;
  findByStorageKey(storageKey: string): Promise<DocumentStorageRecord | null>;
  markUploaded(documentId: number): Promise<boolean>;
  findViewableById(businessId: number, documentId: number): Promise<ViewableDocument | null>;
  findViewableByCaseId(caseId: number, documentId: number): Promise<ViewableDocument | null>;
  claimForProcessing(documentId: number): Promise<ProcessingDocument | null>;
  completeProcessing(
    documentId: number,
    answer: DocumentRequirementAnswer,
    status: "EXTRACTED" | "NEEDS_REVIEW"
  ): Promise<boolean>;
  markProcessingFailed(documentId: number): Promise<boolean>;
}
