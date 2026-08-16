export type DocumentUploadContext = { caseId: number; schemaId: number; documentTypeId: number };
export type PendingDocumentInput = DocumentUploadContext & {
  id: number;
  caseDocumentSpecificationId: number; filename: string; storageKey: string;
  mimeType: string; sizeBytes: number; uploadedById: number;
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
export interface IDocumentRepository {
  reserveDocumentId(): Promise<number>;
  getUploadContext(businessId: number, caseId: number, specificationId: number): Promise<DocumentUploadContext | null>;
  createPendingDocument(input: PendingDocumentInput): Promise<PendingDocument>;
  findByStorageKey(storageKey: string): Promise<DocumentStorageRecord | null>;
  markUploaded(documentId: number): Promise<boolean>;
  findViewableById(businessId: number, documentId: number): Promise<ViewableDocument | null>;
}
