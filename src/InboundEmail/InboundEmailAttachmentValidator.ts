import { ALLOWED_DOCUMENT_MIME_TYPES, documentUploadLimitFromEnv, sanitizeFilename } from "../Documents/DocumentUploadService";

export type InboundAttachment = { filename: string; contentType: string; content: Uint8Array };
export type ValidAttachment = InboundAttachment & { filename: string; mimeType: "application/pdf" | "image/jpeg" | "image/png" };

export function validateInboundAttachment(attachment: InboundAttachment, maxBytes = documentUploadLimitFromEnv()): ValidAttachment | null {
  const mimeType = attachment.contentType.toLowerCase().split(";", 1)[0].trim();
  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType) || attachment.content.byteLength === 0 || attachment.content.byteLength > maxBytes) return null;
  if (!matchesMagicBytes(mimeType, attachment.content)) return null;
  return { ...attachment, filename: sanitizeFilename(attachment.filename || "document"), mimeType: mimeType as ValidAttachment["mimeType"] };
}

function matchesMagicBytes(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === "application/pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (mimeType === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (mimeType === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return false;
}
function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}
