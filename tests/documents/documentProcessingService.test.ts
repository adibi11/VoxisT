import { describe, expect, it, vi } from "vitest";
import {
  DocumentProcessingService,
  normalizeRequirementAnswer,
  parseExtractionSchema
} from "../../src/Documents/DocumentProcessingService";
import { buildDocumentAnswerJsonSchema } from "../../src/Documents/Vision/OpenAIDocumentVisionClient";
import { DocumentExtractionSchema, DocumentRequirementAnswer } from "../../src/Documents/documentProcessingTypes";
import { NullLogger } from "../../src/logging/logger";

const schema: DocumentExtractionSchema = {
  expectedDocumentType: "Salary slip",
  schemaName: "Salary slip V1",
  fields: [
    { id: "employee_name", label: "Employee name", type: "TEXT", required: true },
    { id: "employee_count", label: "Employee count", type: "NUMBER", required: true },
    { id: "net_salary", label: "Net salary", type: "CURRENCY", required: true },
    { id: "pay_date", label: "Pay date", type: "DATE", required: true },
    { id: "is_final", label: "Is final", type: "BOOLEAN", required: false }
  ]
};

const matchingAnswer: DocumentRequirementAnswer = {
  documentMatch: { matches: true, detectedType: "Salary slip" },
  fields: {
    employee_name: { value: "Ada Lovelace", status: "EXTRACTED" },
    employee_count: { value: 1, status: "EXTRACTED" },
    net_salary: { value: 14500, status: "EXTRACTED" },
    pay_date: { value: "2026-08-01", status: "EXTRACTED" },
    is_final: { value: true, status: "EXTRACTED" }
  }
};

function collaborators(answer: DocumentRequirementAnswer = matchingAnswer) {
  const documents = {
    claimForProcessing: vi.fn().mockResolvedValue({
      id: 50,
      storageKey: "businesses/7/cases/20/documents/50/salary.pdf",
      filename: "salary.pdf",
      mimeType: "application/pdf",
      schemaName: schema.schemaName,
      documentTypeName: schema.expectedDocumentType,
      requirementSchema: { fields: schema.fields }
    }),
    completeProcessing: vi.fn().mockResolvedValue(true),
    markProcessingFailed: vi.fn().mockResolvedValue(true)
  };
  const storage = { getDocument: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) };
  const vision = { extract: vi.fn().mockResolvedValue(answer) };
  const service = new DocumentProcessingService(documents as any, storage as any, vision, new NullLogger());
  return { documents, storage, vision, service };
}

describe("DocumentProcessingService", () => {
  it("transitions a matching document through PROCESSING to EXTRACTED", async () => {
    const { documents, storage, vision, service } = collaborators();
    await expect(service.process(50)).resolves.toEqual({ outcome: "extracted", documentId: 50 });
    expect(documents.claimForProcessing).toHaveBeenCalledWith(50);
    expect(storage.getDocument).toHaveBeenCalledWith("businesses/7/cases/20/documents/50/salary.pdf");
    expect(vision.extract).toHaveBeenCalledWith(expect.objectContaining({
      filename: "salary.pdf", mimeType: "application/pdf"
    }), schema);
    expect(documents.completeProcessing).toHaveBeenCalledWith(50, matchingAnswer, "EXTRACTED");
  });

  it("ends a wrong document type as NEEDS_REVIEW without fabricated values", async () => {
    const wrong = {
      documentMatch: { matches: false, detectedType: "Bank statement" },
      fields: Object.fromEntries(schema.fields.map((field) => [field.id, { value: "fabricated", status: "EXTRACTED" }]))
    } as unknown as DocumentRequirementAnswer;
    const { documents, service } = collaborators(wrong);
    await expect(service.process(50)).resolves.toEqual({ outcome: "needs_review", documentId: 50 });
    const persisted = documents.completeProcessing.mock.calls[0][1] as DocumentRequirementAnswer;
    expect(documents.completeProcessing.mock.calls[0][2]).toBe("NEEDS_REVIEW");
    expect(Object.values(persisted.fields)).toEqual(
      schema.fields.map(() => ({ value: null, status: "MISSING" }))
    );
  });

  it("persists exactly the Schema field IDs", async () => {
    const { documents, service } = collaborators();
    await service.process(50);
    const persisted = documents.completeProcessing.mock.calls[0][1] as DocumentRequirementAnswer;
    expect(Object.keys(persisted.fields)).toEqual(schema.fields.map((field) => field.id));
    expect(() => normalizeRequirementAnswer({
      ...matchingAnswer,
      fields: { ...matchingAnswer.fields, invented: { value: "x", status: "EXTRACTED" } }
    }, schema)).toThrow("field IDs");
  });

  it("normalizes an unavailable field to null/MISSING", async () => {
    const answer = structuredClone(matchingAnswer);
    answer.fields.employee_name = { value: null, status: "EXTRACTED" };
    const { documents, service } = collaborators(answer);
    await service.process(50);
    const persisted = documents.completeProcessing.mock.calls[0][1] as DocumentRequirementAnswer;
    expect(persisted.fields.employee_name).toEqual({ value: null, status: "MISSING" });
  });

  it("preserves normalized NUMBER, CURRENCY, BOOLEAN, and DATE values", async () => {
    const { documents, service } = collaborators();
    await service.process(50);
    const fields = (documents.completeProcessing.mock.calls[0][1] as DocumentRequirementAnswer).fields;
    expect(fields.employee_count.value).toBe(1);
    expect(fields.net_salary.value).toBe(14500);
    expect(fields.is_final.value).toBe(true);
    expect(fields.pay_date.value).toBe("2026-08-01");
  });

  it("marks PROCESSING as FAILED when the Vision provider fails", async () => {
    const { documents, vision, service } = collaborators();
    vision.extract.mockRejectedValue(new Error("provider unavailable"));
    await expect(service.process(50)).resolves.toEqual({ outcome: "failed", documentId: 50 });
    expect(documents.markProcessingFailed).toHaveBeenCalledWith(50);
    expect(documents.completeProcessing).not.toHaveBeenCalled();
  });

  it("marks PROCESSING as FAILED when S3 retrieval fails", async () => {
    const { documents, storage, vision, service } = collaborators();
    storage.getDocument.mockRejectedValue(new Error("S3 unavailable"));
    await expect(service.process(50)).resolves.toEqual({ outcome: "failed", documentId: 50 });
    expect(documents.markProcessingFailed).toHaveBeenCalledWith(50);
    expect(vision.extract).not.toHaveBeenCalled();
  });

  it("does not regress or reprocess a document that cannot be claimed from UPLOADED", async () => {
    const { documents, storage, vision, service } = collaborators();
    documents.claimForProcessing.mockResolvedValue(null);
    await expect(service.process(50)).resolves.toEqual({ outcome: "not_processable", documentId: 50 });
    expect(storage.getDocument).not.toHaveBeenCalled();
    expect(vision.extract).not.toHaveBeenCalled();
    expect(documents.completeProcessing).not.toHaveBeenCalled();
    expect(documents.markProcessingFailed).not.toHaveBeenCalled();
  });
});

describe("document extraction schema", () => {
  it("parses only supported Voxis field definitions", () => {
    expect(parseExtractionSchema(schema.schemaName, schema.expectedDocumentType, { fields: schema.fields })).toEqual(schema);
  });

  it("builds strict Structured Output properties from exact Schema IDs and value types", () => {
    const output = buildDocumentAnswerJsonSchema(schema) as any;
    expect(output.properties.fields.required).toEqual(schema.fields.map((field) => field.id));
    expect(Object.keys(output.properties.fields.properties)).toEqual(schema.fields.map((field) => field.id));
    expect(output.properties.fields.additionalProperties).toBe(false);
    expect(output.properties.fields.properties.net_salary.properties.value.type).toEqual(["number", "null"]);
    expect(output.properties.fields.properties.is_final.properties.value.type).toEqual(["boolean", "null"]);
  });
});

