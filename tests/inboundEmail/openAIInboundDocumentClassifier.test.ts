import { describe, expect, it, vi } from "vitest";
import { NullLogger } from "../../src/logging/logger";
import {
  inboundDocumentClassificationJsonSchema,
  OpenAIInboundDocumentClassifier
} from "../../src/InboundEmail/OpenAIInboundDocumentClassifier";

describe("OpenAIInboundDocumentClassifier", () => {
  it("sends only classification candidates and returns structured output", async () => {
    const create = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({ caseDocumentSpecificationId: 12, confidence: "HIGH" }),
      _request_id: "req-classification-safe"
    });
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
    const classifier = new OpenAIInboundDocumentClassifier(logger, { responses: { create } } as any);
    await expect(classifier.classify(
      { filename: "slip.pdf", mimeType: "application/pdf", bytes: Buffer.from("%PDF-test"), language: "he" },
      [{ caseDocumentSpecificationId: 12, documentTypeName: "תלוש שכר", schemaName: "תלוש V1", documentTypeCategory: "שכר", label: "תלוש יולי" }]
    )).resolves.toEqual({ caseDocumentSpecificationId: 12, confidence: "HIGH" });

    const request = create.mock.calls[0][0];
    expect(request.text.format).toEqual(expect.objectContaining({
      type: "json_schema", strict: true, schema: inboundDocumentClassificationJsonSchema()
    }));
    expect(request.instructions).toContain("right-to-left");
    expect(request.instructions).toContain("HIGH means exactly one candidate");
    expect(request.input[0].content[0].text).toContain("תלוש שכר");
    expect(request.input[0].content[0].text).toContain("תלוש V1");
    expect(request.input[0].content[0].text).toContain("שכר");
    expect(request.input[0].content[0].text).not.toContain("requirementSchema");
    expect(request.input[0].content[1]).toEqual(expect.objectContaining({ type: "input_file", filename: "slip.pdf" }));
    const logs = JSON.stringify(logger.info.mock.calls);
    expect(logs).toContain("req-classification-safe");
    expect(logs).toContain("12");
    expect(logs).not.toContain("%PDF-test");
  });

  it("defines a closed schema with nullable candidate ID and explicit confidence", () => {
    expect(inboundDocumentClassificationJsonSchema()).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["caseDocumentSpecificationId", "confidence"],
      properties: {
        caseDocumentSpecificationId: { type: ["integer", "null"] },
        confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }
      }
    });
  });
});
