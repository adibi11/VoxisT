export type CaseEmailRoute = { caseId: number; businessId: number; businessLanguage: string };
export type ReceiptClaim =
  | { outcome: "claimed"; receiptId: number }
  | { outcome: "processed" }
  | { outcome: "busy" };
export type EmailDocumentRecord = { id: number; storageKey: string; status: string };
export type InboundDocumentCandidate = {
  caseDocumentSpecificationId: number;
  documentTypeName: string;
  schemaName: string;
  documentTypeCategory: string | null;
  label: string | null;
};

export interface IInboundEmailRepository {
  getOrCreateCaseToken(businessId: number, caseId: number, tokenFactory: () => string): Promise<string | null>;
  resolveCaseToken(token: string): Promise<CaseEmailRoute | null>;
  claimReceipt(input: { providerMessageId: string; rawStorageKey: string; businessId: number; caseId: number }): Promise<ReceiptClaim>;
  listNeededDocumentCandidates(businessId: number, caseId: number): Promise<InboundDocumentCandidate[]>;
  getOrCreateAttachmentDocument(input: {
    receiptId: number; attachmentIndex: number; businessId: number; caseId: number;
    filename: string; mimeType: string; sizeBytes: number; caseDocumentSpecificationId: number | null;
  }): Promise<EmailDocumentRecord>;
  markReceiptProcessed(receiptId: number): Promise<void>;
  markReceiptRejected(receiptId: number, reason: string): Promise<void>;
  markReceiptFailed(receiptId: number, reason: string): Promise<void>;
}
