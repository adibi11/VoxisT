import { describe, expect, it, vi } from "vitest";
import { S3DocumentUploadEventProcessor } from "../../src/Documents/S3DocumentUploadEventProcessor";
import { NullLogger } from "../../src/logging/logger";

function s3Body(...keys: string[]): string {
  return JSON.stringify({ Records: keys.map((key) => ({ s3: { object: { key } } })) });
}

const DEFAULT_BODY = Symbol("default-body");

function setup(body: string | null | undefined | typeof DEFAULT_BODY = DEFAULT_BODY, status = "PENDING_UPLOAD") {
  const messageBody = body === DEFAULT_BODY ? s3Body("businesses/7/cases/20/documents/50/file.pdf") : body ?? undefined;
  const sqs = {
    receiveMessages: vi.fn().mockResolvedValue([{ messageId: "m-1", receiptHandle: "receipt-1", body: messageBody }]),
    deleteMessage: vi.fn().mockResolvedValue(undefined)
  };
  const documents = {
    findByStorageKey: vi.fn().mockResolvedValue({ id: 50, status }),
    markUploaded: vi.fn().mockResolvedValue(true)
  };
  return { sqs, documents, processor: new S3DocumentUploadEventProcessor(sqs, documents as any, new NullLogger()) };
}

describe("S3DocumentUploadEventProcessor", () => {
  it("maps an S3 key to a Document and transitions PENDING_UPLOAD to UPLOADED", async () => {
    const { processor, documents, sqs } = setup();
    await expect(processor.pollOnce()).resolves.toEqual({ received: 1, acknowledged: 1, failed: 0 });
    expect(documents.findByStorageKey).toHaveBeenCalledWith("businesses/7/cases/20/documents/50/file.pdf");
    expect(documents.markUploaded).toHaveBeenCalledWith(50);
    expect(sqs.deleteMessage).toHaveBeenCalledWith("receipt-1");
  });

  it("decodes URL-encoded S3 keys", async () => {
    const { processor, documents } = setup(s3Body("businesses%2F7%2Fsalary+slip.pdf"));
    await processor.pollOnce();
    expect(documents.findByStorageKey).toHaveBeenCalledWith("businesses/7/salary slip.pdf");
  });

  it("handles multiple Records in one message", async () => {
    const { processor, documents } = setup(s3Body("first.pdf", "second.pdf"));
    await processor.pollOnce();
    expect(documents.findByStorageKey).toHaveBeenNthCalledWith(1, "first.pdf");
    expect(documents.findByStorageKey).toHaveBeenNthCalledWith(2, "second.pdf");
  });

  it("is idempotent for an already-UPLOADED Document", async () => {
    const { processor, documents } = setup(s3Body("file.pdf"), "UPLOADED");
    await processor.pollOnce();
    expect(documents.markUploaded).not.toHaveBeenCalled();
  });

  it.each(["PROCESSING", "EXTRACTED", "NEEDS_REVIEW", "VERIFIED"])(
    "does not regress later lifecycle status %s", async (status) => {
      const { processor, documents } = setup(s3Body("file.pdf"), status);
      await processor.pollOnce();
      expect(documents.markUploaded).not.toHaveBeenCalled();
    }
  );

  it("leaves FAILED unchanged", async () => {
    const { processor, documents, sqs } = setup(s3Body("file.pdf"), "FAILED");
    await processor.pollOnce();
    expect(documents.markUploaded).not.toHaveBeenCalled();
    expect(sqs.deleteMessage).toHaveBeenCalled();
  });

  it("accepts and acknowledges a missing Document without crashing", async () => {
    const { processor, documents, sqs } = setup();
    documents.findByStorageKey.mockResolvedValue(null);
    await expect(processor.pollOnce()).resolves.toEqual({ received: 1, acknowledged: 1, failed: 0 });
    expect(sqs.deleteMessage).toHaveBeenCalled();
  });

  it.each([null, "not json", JSON.stringify({ Records: [] }), s3Body("")])(
    "safely accepts malformed message body %#", async (body) => {
      const { processor, documents, sqs } = setup(body);
      await expect(processor.pollOnce()).resolves.toEqual({ received: 1, acknowledged: 1, failed: 0 });
      expect(documents.findByStorageKey).not.toHaveBeenCalled();
      expect(sqs.deleteMessage).toHaveBeenCalled();
    }
  );

  it("does not delete the SQS message when database processing fails", async () => {
    const { processor, documents, sqs } = setup();
    documents.findByStorageKey.mockRejectedValue(new Error("database unavailable"));
    await expect(processor.pollOnce()).resolves.toEqual({ received: 1, acknowledged: 0, failed: 1 });
    expect(sqs.deleteMessage).not.toHaveBeenCalled();
  });
});
