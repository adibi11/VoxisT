import { simpleParser, AddressObject } from "mailparser";
import { IDocumentStorage } from "../Storage/DocumentStorage/IDocumentStorage";
import { ILogger } from "../logging/logger";
import { ISqsClient, SqsMessage } from "../QueueClient/Sqs/ISqsClient";
import { parseStorageKeys } from "../Documents/S3DocumentUploadEventProcessor";
import { IInboundEmailRepository } from "./inboundEmailTypes";
import { IRawEmailStorage } from "./RawEmailStorage";
import { validateInboundAttachment } from "./InboundEmailAttachmentValidator";
import { inboundEmailTokenPattern } from "./inboundEmailToken";
import { IInboundDocumentClassifier } from "./InboundDocumentClassifier";
import { documentLanguageFromBusiness } from "../Documents/Vision/DocumentVisionPrompts";

export class InboundEmailProcessor {
  constructor(
    private readonly sqs: ISqsClient,
    private readonly rawStorage: IRawEmailStorage,
    private readonly documentStorage: IDocumentStorage,
    private readonly repository: IInboundEmailRepository,
    private readonly domain: string,
    private readonly logger: ILogger,
    private readonly classifier?: IInboundDocumentClassifier
  ) {}

  async pollOnce(): Promise<{ received: number; acknowledged: number; failed: number }> {
    const messages = await this.sqs.receiveMessages();
    const result = { received: messages.length, acknowledged: 0, failed: 0 };
    for (const message of messages) {
      try {
        await this.processMessage(message);
        await this.sqs.deleteMessage(message.receiptHandle);
        result.acknowledged += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error("inbound_email.message.failed", { messageId: message.messageId, error });
      }
    }
    return result;
  }

  private async processMessage(message: SqsMessage): Promise<void> {
    if (isS3TestEvent(message.body)) {
      this.logger.info("inbound_email.message.test_event_ignored", {
        messageId: message.messageId,
        bodyLength: message.body?.length ?? 0
      });
      return;
    }

    const keys = parseStorageKeys(message.body);
    if (!keys) {
      this.logger.warn("inbound_email.message.malformed", {
        messageId: message.messageId,
        ...s3MessageDiagnostics(message.body)
      });
      return;
    }
    for (const rawStorageKey of keys) await this.processRawEmail(rawStorageKey);
  }

  async processRawEmail(rawStorageKey: string): Promise<void> {
    const raw = await this.rawStorage.getRawEmail(rawStorageKey);
    const email = await simpleParser(Buffer.from(raw));
    this.logger.info("inbound_email.message.parsed", {
      rawStorageKey,
      subject: email.subject,
      from: email.from?.text,
      attachments: email.attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        size: attachment.size
      }))
    });
    const route = await this.resolveRoute(addresses(email.to).concat(addresses(email.cc)).concat(headerAddresses(email.headers.get("delivered-to"))));
    if (!route) { this.logger.warn("inbound_email.recipient.unresolved", { rawStorageKey }); return; }
    const providerMessageId = rawStorageKey.split("/").filter(Boolean).pop() || rawStorageKey;
    const claim = await this.repository.claimReceipt({
      providerMessageId,
      rawStorageKey,
      businessId: route.businessId,
      caseId: route.caseId
    });
    if (claim.outcome === "processed") return;
    if (claim.outcome === "busy") throw new Error("Inbound email receipt is already processing");
    try {
      let accepted = 0;
      for (let index = 0; index < email.attachments.length; index += 1) {
        const attachment = email.attachments[index];
        const valid = validateInboundAttachment({ filename: attachment.filename || "document", contentType: attachment.contentType, content: attachment.content });
        if (!valid) {
          this.logger.warn("inbound_email.attachment.rejected", { receiptId: claim.receiptId, attachmentIndex: index, contentType: attachment.contentType, sizeBytes: attachment.size });
          continue;
        }
        const caseDocumentSpecificationId = await this.classifyAttachment(
          route.businessId,
          route.caseId,
          route.businessLanguage,
          valid
        );
        const document = await this.repository.getOrCreateAttachmentDocument({
          receiptId: claim.receiptId, attachmentIndex: index,
          businessId: route.businessId, caseId: route.caseId,
          filename: valid.filename, mimeType: valid.mimeType, sizeBytes: valid.content.byteLength,
          caseDocumentSpecificationId
        });
        if (document.status === "PENDING_UPLOAD") {
          await this.documentStorage.putDocument({ storageKey: document.storageKey, contentType: valid.mimeType, bytes: valid.content });
        }
        accepted += 1;
      }
      if (accepted === 0) await this.repository.markReceiptRejected(claim.receiptId, "no_supported_attachments");
      else await this.repository.markReceiptProcessed(claim.receiptId);
      this.logger.info("inbound_email.processed", { receiptId: claim.receiptId, acceptedAttachments: accepted, caseId: route.caseId, businessId: route.businessId });
    } catch (error) {
      await this.repository.markReceiptFailed(claim.receiptId, error instanceof Error ? error.message : "unknown failure");
      throw error;
    }
  }

  private async classifyAttachment(
    businessId: number,
    caseId: number,
    businessLanguage: string,
    attachment: { filename: string; mimeType: "application/pdf" | "image/jpeg" | "image/png"; content: Uint8Array }
  ): Promise<number | null> {
    if (!this.classifier) return null;
    const candidates = await this.repository.listNeededDocumentCandidates(businessId, caseId);
    if (candidates.length === 0) return null;
    try {
      const result = await this.classifier.classify({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        bytes: attachment.content,
        language: documentLanguageFromBusiness(businessLanguage)
      }, candidates);
      const validCandidate = result.confidence === "HIGH"
        && result.caseDocumentSpecificationId !== null
        && candidates.some((candidate) => candidate.caseDocumentSpecificationId === result.caseDocumentSpecificationId);
      if (validCandidate) return result.caseDocumentSpecificationId;
      this.logger.warn("inbound_email.classification.unassigned", {
        caseId,
        businessLanguage: documentLanguageFromBusiness(businessLanguage),
        candidateIds: candidates.map((candidate) => candidate.caseDocumentSpecificationId),
        confidence: result.confidence,
        returnedCandidate: result.caseDocumentSpecificationId,
        validCandidate: result.caseDocumentSpecificationId === null
          ? false
          : candidates.some((candidate) => candidate.caseDocumentSpecificationId === result.caseDocumentSpecificationId)
      });
      return null;
    } catch (error) {
      this.logger.warn("inbound_email.classification.failed", {
        caseId,
        businessLanguage: documentLanguageFromBusiness(businessLanguage),
        candidateIds: candidates.map((candidate) => candidate.caseDocumentSpecificationId),
        error
      });
      return null;
    }
  }

  private async resolveRoute(values: string[]) {
    for (const value of values) {
      const match = new RegExp(`^case-(${inboundEmailTokenPattern()})@${escapeRegex(this.domain)}$`, "i").exec(value.trim().toLowerCase());
      if (match) {
        const route = await this.repository.resolveCaseToken(match[1]);
        if (route) return route;
      }
    }
    return null;
  }
}

function addresses(value: AddressObject | AddressObject[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).flatMap((item) => item.value.map((entry) => entry.address).filter((address): address is string => Boolean(address)));
}
function headerAddresses(value: unknown): string[] {
  if (typeof value === "string") return value.split(",").map((item) => item.trim().replace(/^.*<|>.*$/g, ""));
  if (value && typeof value === "object" && "value" in value) return addresses(value as AddressObject);
  return [];
}
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function isS3TestEvent(body: string | undefined): boolean {
  if (!body) return false;
  try {
    const value = JSON.parse(body) as Record<string, unknown>;
    return value?.Service === "Amazon S3" && value?.Event === "s3:TestEvent";
  } catch {
    return false;
  }
}

export function s3MessageDiagnostics(body: string | undefined): {
  bodyLength: number;
  jsonParsed: boolean;
  topLevelType: "missing" | "array" | "object" | "primitive";
  hasRecords: boolean;
  recordCount: number | null;
} {
  if (!body) return { bodyLength: 0, jsonParsed: false, topLevelType: "missing", hasRecords: false, recordCount: null };
  try {
    const value = JSON.parse(body) as unknown;
    const topLevelType = Array.isArray(value) ? "array" : value !== null && typeof value === "object" ? "object" : "primitive";
    const records = topLevelType === "object" ? (value as { Records?: unknown }).Records : undefined;
    return {
      bodyLength: body.length,
      jsonParsed: true,
      topLevelType,
      hasRecords: Array.isArray(records),
      recordCount: Array.isArray(records) ? records.length : null
    };
  } catch {
    return { bodyLength: body.length, jsonParsed: false, topLevelType: "primitive", hasRecords: false, recordCount: null };
  }
}


