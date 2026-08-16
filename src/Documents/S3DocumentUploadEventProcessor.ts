import { IDocumentRepository } from "../dataClients/SqlClient/Repositories/DocumentRepo/IDocumentRepository";
import { ILogger } from "../logging/logger";
import { ISqsClient, SqsMessage } from "../QueueClient/Sqs/ISqsClient";

export type S3DocumentPollResult = { received: number; acknowledged: number; failed: number };

type S3Event = { Records?: Array<{ s3?: { object?: { key?: unknown } } }> };

export class S3DocumentUploadEventProcessor {
  constructor(
    private readonly sqs: ISqsClient,
    private readonly documents: IDocumentRepository,
    private readonly logger: ILogger
  ) {}

  async pollOnce(): Promise<S3DocumentPollResult> {
    const messages = await this.sqs.receiveMessages();
    const result = { received: messages.length, acknowledged: 0, failed: 0 };
    for (const message of messages) {
      this.logger.info("documentUploadEvent.message.received", { messageId: message.messageId });
      try {
        await this.processMessage(message);
        await this.sqs.deleteMessage(message.receiptHandle);
        result.acknowledged += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error("documentUploadEvent.message.failed", { error, messageId: message.messageId });
      }
    }
    return result;
  }

  private async processMessage(message: SqsMessage): Promise<void> {
    const storageKeys = parseStorageKeys(message.body);
    if (!storageKeys) {
      this.logger.warn("documentUploadEvent.message.malformed", { messageId: message.messageId });
      return;
    }

    for (const storageKey of storageKeys) {
      this.logger.info("documentUploadEvent.storage_key.decoded", { messageId: message.messageId, storageKey });
      const document = await this.documents.findByStorageKey(storageKey);
      if (!document) {
        this.logger.warn("documentUploadEvent.document.missing", { messageId: message.messageId, storageKey });
        continue;
      }

      this.logger.info("documentUploadEvent.document.found", { documentId: document.id, status: document.status });
      if (document.status === "PENDING_UPLOAD") {
        const transitioned = await this.documents.markUploaded(document.id);
        if (transitioned) {
          this.logger.info("documentUploadEvent.document.uploaded", { documentId: document.id });
        } else {
          this.logger.info("documentUploadEvent.document.already_processed", { documentId: document.id });
        }
        continue;
      }

      if (document.status === "FAILED") {
        this.logger.warn("documentUploadEvent.document.failed_unchanged", { documentId: document.id });
        continue;
      }

      this.logger.info("documentUploadEvent.document.already_processed", {
        documentId: document.id,
        status: document.status
      });
    }
  }
}

export function parseStorageKeys(body: string | undefined): string[] | null {
  if (!body) return null;
  try {
    const event = JSON.parse(body) as S3Event;
    if (!Array.isArray(event.Records) || event.Records.length === 0) return null;
    const keys: string[] = [];
    for (const record of event.Records) {
      const encodedKey = record?.s3?.object?.key;
      if (typeof encodedKey !== "string" || encodedKey.length === 0) return null;
      keys.push(decodeURIComponent(encodedKey.replace(/\+/g, " ")));
    }
    return keys;
  } catch {
    return null;
  }
}
