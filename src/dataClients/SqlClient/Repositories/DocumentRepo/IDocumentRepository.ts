export type DocumentUploadContext = { caseId: number; schemaId: number; documentTypeId: number };
export type PendingDocumentInput = DocumentUploadContext & {
  id: number;
  caseDocumentSpecificationId: number; filename: string; storageKey: string;
  mimeType: string; sizeBytes: number; uploadedById: number;
};
export type PendingDocument = {
  id: number; filename: string; status: "PENDING_UPLOAD"; mimeType: string; sizeBytes: number;
};
export interface IDocumentRepository {
  reserveDocumentId(): Promise<number>;
  getUploadContext(businessId: number, caseId: number, specificationId: number): Promise<DocumentUploadContext | null>;
  createPendingDocument(input: PendingDocumentInput): Promise<PendingDocument>;
}

