import { CreateDocumentUploadRequestDto, DocumentUploadRequestResponseDto } from "../contracts";
import { IDocumentRepository } from "../dataClients/SqlClient/Repositories/DocumentRepo/IDocumentRepository";
import { IDocumentStorage } from "../Storage/DocumentStorage/IDocumentStorage";

export const DOCUMENT_UPLOAD_URL_TTL_SECONDS = 300;
export const DEFAULT_MAX_DOCUMENT_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_DOCUMENT_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export type DocumentUploadActor =
  | { source: "ADVISOR_UPLOAD"; uploadedById: number }
  | { source: "CLIENT_PORTAL"; uploadedById: null };

export type PrepareUploadResult = { outcome: "created"; response: DocumentUploadRequestResponseDto }
  | { outcome: "not_found" };

export class DocumentUploadService {
  constructor(private readonly repository: IDocumentRepository, private readonly storage: IDocumentStorage) {}

  async prepareUpload(
    businessId: number,
    caseId: number,
    actor: DocumentUploadActor,
    request: CreateDocumentUploadRequestDto
  ): Promise<PrepareUploadResult> {
    const context = await this.repository.getUploadContext(businessId, caseId, request.caseDocumentSpecificationId);
    if (!context) return { outcome: "not_found" };
    const filename = sanitizeFilename(request.filename);
    const documentId = await this.repository.reserveDocumentId();
    const storageKey = `businesses/${businessId}/cases/${caseId}/documents/${documentId}/${filename}`;
    const url = await this.storage.createUploadUrl({
      storageKey,
      contentType: request.mimeType,
      expiresInSeconds: DOCUMENT_UPLOAD_URL_TTL_SECONDS
    });
    const document = await this.repository.createPendingDocument({
      ...context,
      id: documentId,
      caseDocumentSpecificationId: request.caseDocumentSpecificationId,
      filename,
      storageKey,
      mimeType: request.mimeType,
      sizeBytes: request.sizeBytes,
      uploadedById: actor.uploadedById,
      source: actor.source
    });
    return {
      outcome: "created",
      response: {
        document,
        upload: { url, method: "PUT", expiresInSeconds: DOCUMENT_UPLOAD_URL_TTL_SECONDS }
      }
    };
  }
}

export function isValidDocumentUploadRequest(request: Partial<CreateDocumentUploadRequestDto> | undefined,
  maxBytes = documentUploadLimitFromEnv()): request is CreateDocumentUploadRequestDto {
  return Boolean(request && Number.isInteger(request.caseDocumentSpecificationId) && request.caseDocumentSpecificationId! > 0
    && typeof request.filename === "string" && request.filename.trim().length > 0
    && typeof request.mimeType === "string" && ALLOWED_DOCUMENT_MIME_TYPES.has(request.mimeType)
    && Number.isInteger(request.sizeBytes) && request.sizeBytes! > 0 && request.sizeBytes! <= maxBytes);
}

export function documentUploadLimitFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.DOCUMENT_UPLOAD_MAX_BYTES);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_DOCUMENT_UPLOAD_BYTES;
}

export function sanitizeFilename(filename: string): string {
  const basename = filename.trim().replace(/\\/g, "/").split("/").pop() ?? "document";
  const safe = basename.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^\.+/, "").slice(0, 180);
  return safe || "document";
}
