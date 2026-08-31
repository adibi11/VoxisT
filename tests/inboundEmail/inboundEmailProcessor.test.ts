import { describe, expect, it, vi } from "vitest";
import { InboundEmailProcessor } from "../../src/InboundEmail/InboundEmailProcessor";
import { NullLogger } from "../../src/logging/logger";

function rawEmail(): Uint8Array {
  return Buffer.from([
    `To: case-${"a".repeat(16)}@docs.voxistudio.com`,
    "From: client@example.com", "Subject: documents", "MIME-Version: 1.0",
    "Content-Type: multipart/mixed; boundary=BOUNDARY", "", "--BOUNDARY",
    "Content-Type: text/plain", "", "this body must be ignored", "--BOUNDARY",
    "Content-Type: application/pdf", "Content-Disposition: attachment; filename=one.pdf", "Content-Transfer-Encoding: base64", "", Buffer.from("%PDF-one").toString("base64"),
    "--BOUNDARY", "Content-Type: image/png", "Content-Disposition: attachment; filename=two.png", "Content-Transfer-Encoding: base64", "", Buffer.from(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1])).toString("base64"),
    "--BOUNDARY--", ""
  ].join("\r\n"));
}

function setup(claim: any = { outcome: "claimed", receiptId: 4 }, body?: string, logger: any = new NullLogger(), classifier?: any) {
  const sqs = { receiveMessages: vi.fn().mockResolvedValue([{ receiptHandle: "r", body: body ?? JSON.stringify({ Records: [{ s3: { object: { key: "inbound-email%2Fraw%2Fses-1" } } }] }) }]), deleteMessage: vi.fn() };
  const rawStorage = { getRawEmail: vi.fn().mockResolvedValue(rawEmail()) };
  const documentStorage = { putDocument: vi.fn() };
  const repository = {
    resolveCaseToken: vi.fn().mockResolvedValue({ businessId: 7, caseId: 20, businessLanguage: "he" }),
    claimReceipt: vi.fn().mockResolvedValue(claim),
    listNeededDocumentCandidates: vi.fn().mockResolvedValue([
      { caseDocumentSpecificationId: 12, documentTypeName: "תלוש שכר", schemaName: "תלוש שכר V1", documentTypeCategory: "שכר", label: "תלוש יולי" },
      { caseDocumentSpecificationId: 13, documentTypeName: "דפי חשבון", schemaName: "דפי חשבון V1", documentTypeCategory: "בנקאות", label: "שלושה חודשים אחרונים" }
    ]),
    getOrCreateAttachmentDocument: vi.fn().mockImplementation(async ({ attachmentIndex }) => ({ id: 50 + attachmentIndex, storageKey: `businesses/7/cases/20/documents/${50 + attachmentIndex}/file`, status: "PENDING_UPLOAD" })),
    markReceiptProcessed: vi.fn(), markReceiptRejected: vi.fn(), markReceiptFailed: vi.fn()
  };
  const processor = new InboundEmailProcessor(sqs as any, rawStorage, documentStorage as any, repository as any, "docs.voxistudio.com", logger, classifier);
  return { processor, sqs, repository, documentStorage, rawStorage, logger };
}

describe("InboundEmailProcessor", () => {
  it("acknowledges and explicitly ignores a native S3 TestEvent", async () => {
    const body = JSON.stringify({ Service: "Amazon S3", Event: "s3:TestEvent", Time: "2026-08-25T00:00:00.000Z", Bucket: "redacted", RequestId: "request", HostId: "host" });
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
    const { processor, sqs, rawStorage } = setup({ outcome: "claimed", receiptId: 4 }, body, logger);
    await expect(processor.pollOnce()).resolves.toEqual({ received: 1, acknowledged: 1, failed: 0 });
    expect(rawStorage.getRawEmail).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("inbound_email.message.test_event_ignored", { messageId: undefined, bodyLength: body.length });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(sqs.deleteMessage).toHaveBeenCalledWith("r");
  });

  it("parses a normal native s3:ObjectCreated notification", async () => {
    const body = JSON.stringify({ Records: [{ eventSource: "aws:s3", eventName: "ObjectCreated:Put", s3: { bucket: { name: "redacted" }, object: { key: "inbound-email%2Fraw%2Fses-1" } } }] });
    const { processor, rawStorage } = setup({ outcome: "claimed", receiptId: 4 }, body);
    await processor.pollOnce();
    expect(rawStorage.getRawEmail).toHaveBeenCalledWith("inbound-email/raw/ses-1");
  });

  it("logs only safe shape metadata for malformed messages", async () => {
    const body = JSON.stringify({ unexpected: "sensitive-value-must-not-be-logged" });
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
    const { processor } = setup({ outcome: "claimed", receiptId: 4 }, body, logger);
    await processor.pollOnce();
    expect(logger.warn).toHaveBeenCalledWith("inbound_email.message.malformed", {
      messageId: undefined, bodyLength: body.length, jsonParsed: true, topLevelType: "object", hasRecords: false, recordCount: null
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("sensitive-value-must-not-be-logged");
  });
  it("stores every valid attachment as an unknown tenant-scoped EMAIL Document", async () => {
    const { processor, repository, documentStorage, sqs } = setup();
    await expect(processor.pollOnce()).resolves.toEqual({ received: 1, acknowledged: 1, failed: 0 });
    expect(repository.getOrCreateAttachmentDocument).toHaveBeenCalledTimes(2);
    expect(repository.getOrCreateAttachmentDocument).toHaveBeenNthCalledWith(1, expect.objectContaining({ businessId: 7, caseId: 20, receiptId: 4, attachmentIndex: 0, mimeType: "application/pdf" }));
    expect(documentStorage.putDocument).toHaveBeenCalledTimes(2);
    expect(repository.markReceiptProcessed).toHaveBeenCalledWith(4);
    expect(sqs.deleteMessage).toHaveBeenCalledWith("r");
  });
  it("links only server-validated high-confidence matches and reloads candidates per attachment", async () => {
    const classifier = { classify: vi.fn()
      .mockResolvedValueOnce({ caseDocumentSpecificationId: 12, confidence: "HIGH" })
      .mockResolvedValueOnce({ caseDocumentSpecificationId: 13, confidence: "HIGH" }) };
    const { processor, repository } = setup({ outcome: "claimed", receiptId: 4 }, undefined, new NullLogger(), classifier);
    await processor.pollOnce();
    expect(repository.listNeededDocumentCandidates).toHaveBeenCalledTimes(2);
    expect(classifier.classify).toHaveBeenCalledTimes(2);
    expect(classifier.classify).toHaveBeenCalledWith(expect.objectContaining({ language: "he" }), expect.any(Array));
    expect(repository.getOrCreateAttachmentDocument).toHaveBeenNthCalledWith(1, expect.objectContaining({ caseDocumentSpecificationId: 12 }));
    expect(repository.getOrCreateAttachmentDocument).toHaveBeenNthCalledWith(2, expect.objectContaining({ caseDocumentSpecificationId: 13 }));
  });

  it.each([
    ["medium confidence", { caseDocumentSpecificationId: 12, confidence: "MEDIUM" }],
    ["an invalid candidate ID", { caseDocumentSpecificationId: 999, confidence: "HIGH" }],
    ["no match", { caseDocumentSpecificationId: null, confidence: "LOW" }]
  ])("creates an unassigned document for %s", async (_name, classification) => {
    const classifier = { classify: vi.fn().mockResolvedValue(classification) };
    const { processor, repository } = setup({ outcome: "claimed", receiptId: 4 }, undefined, new NullLogger(), classifier);
    await processor.pollOnce();
    expect(repository.getOrCreateAttachmentDocument).toHaveBeenCalledWith(expect.objectContaining({ caseDocumentSpecificationId: null }));
  });

  it("continues with an unassigned document when classification fails", async () => {
    const classifier = { classify: vi.fn().mockRejectedValue(new Error("provider unavailable")) };
    const { processor, repository, sqs } = setup({ outcome: "claimed", receiptId: 4 }, undefined, new NullLogger(), classifier);
    await expect(processor.pollOnce()).resolves.toEqual({ received: 1, acknowledged: 1, failed: 0 });
    expect(repository.getOrCreateAttachmentDocument).toHaveBeenCalledWith(expect.objectContaining({ caseDocumentSpecificationId: null }));
    expect(sqs.deleteMessage).toHaveBeenCalledWith("r");
  });

  it("does not invoke classification when the case has no needed requirements", async () => {
    const classifier = { classify: vi.fn() };
    const { processor, repository } = setup({ outcome: "claimed", receiptId: 4 }, undefined, new NullLogger(), classifier);
    repository.listNeededDocumentCandidates.mockResolvedValue([]);
    await processor.pollOnce();
    expect(classifier.classify).not.toHaveBeenCalled();
    expect(repository.getOrCreateAttachmentDocument).toHaveBeenCalledWith(expect.objectContaining({ caseDocumentSpecificationId: null }));
  });

  it("does not duplicate attachments for an already processed receipt", async () => {
    const { processor, repository, documentStorage } = setup({ outcome: "processed" });
    await processor.pollOnce();
    expect(repository.getOrCreateAttachmentDocument).not.toHaveBeenCalled();
    expect(documentStorage.putDocument).not.toHaveBeenCalled();
  });
});


