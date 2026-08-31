import { IDocumentRepository } from "../dataClients/SqlClient/Repositories/DocumentRepo/IDocumentRepository";
import { ILogger } from "../logging/logger";
import { IDocumentStorage } from "../Storage/DocumentStorage/IDocumentStorage";
import { IDocumentVisionClient } from "./Vision/IDocumentVisionClient";
import { documentLanguageFromBusiness } from "./Vision/DocumentVisionPrompts";
import {
  DocumentExtractionField,
  DocumentExtractionSchema,
  DocumentFieldType,
  DocumentRequirementAnswer,
  DocumentVisionInput
} from "./documentProcessingTypes";

export type DocumentProcessingResult =
  | { outcome: "extracted" | "needs_review" | "failed"; documentId: number }
  | { outcome: "not_processable"; documentId: number };

export interface IDocumentProcessor {
  process(documentId: number): Promise<DocumentProcessingResult>;
}

export class DocumentProcessingService implements IDocumentProcessor {
  constructor(
    private readonly documents: IDocumentRepository,
    private readonly storage: IDocumentStorage,
    private readonly vision: IDocumentVisionClient,
    private readonly logger: ILogger
  ) {}

  async process(documentId: number): Promise<DocumentProcessingResult> {
    const document = await this.documents.claimForProcessing(documentId);
    if (!document) {
      this.logger.info("document.processing.skipped", { documentId });
      return { outcome: "not_processable", documentId };
    }

    try {
      if (document.schemaName === null || document.documentTypeName === null || document.requirementSchema === null) {
        const persisted = await this.documents.completeUnknownProcessing(documentId);
        if (!persisted) throw new Error("Unknown Document left PROCESSING before completion");
        this.logger.info("document.processing.unknown_needs_review", { documentId });
        return { outcome: "needs_review", documentId };
      }
      const schema = parseExtractionSchema(
        document.schemaName,
        document.documentTypeName,
        document.requirementSchema
      );
      const bytes = await this.storage.getDocument(document.storageKey);
      const visionInput: DocumentVisionInput = {
        bytes,
        filename: document.filename,
        mimeType: parseSupportedMimeType(document.mimeType),
        language: documentLanguageFromBusiness(document.businessLanguage)
      };
      const rawAnswer = await this.vision.extract(visionInput, schema);
      const answer = normalizeRequirementAnswer(rawAnswer, schema);
      const finalStatus = determineDocumentStatus(answer, schema);
      const persisted = await this.documents.completeProcessing(documentId, answer, finalStatus);
      if (!persisted) throw new Error("Document left PROCESSING before completion");
      const outcome = finalStatus === "EXTRACTED" ? "extracted" : "needs_review";
      this.logger.info("document.processing.completed", {
        documentId,
        status: finalStatus,
        language: visionInput.language,
        documentTypeName: schema.expectedDocumentType,
        schemaName: schema.schemaName,
        fieldStatuses: Object.fromEntries(Object.entries(answer.fields).map(([id, field]) => [id, field.status]))
      });
      return { outcome, documentId };
    } catch (error) {
      this.logger.error("document.processing.failed", { error, documentId });
      await this.documents.markProcessingFailed(documentId);
      return { outcome: "failed", documentId };
    }
  }
}

const SUPPORTED_FIELD_TYPES = new Set<DocumentFieldType>([
  "TEXT", "NUMBER", "CURRENCY", "DATE", "BOOLEAN"
]);

export function parseExtractionSchema(
  schemaName: string,
  expectedDocumentType: string,
  requirementSchema: unknown
): DocumentExtractionSchema {
  if (!isRecord(requirementSchema) || !Array.isArray(requirementSchema.fields)) {
    throw new Error("Schema requirementSchema.fields is required");
  }
  const ids = new Set<string>();
  const fields = requirementSchema.fields.map((raw): DocumentExtractionField => {
    if (!isRecord(raw)
      || typeof raw.id !== "string" || raw.id.length === 0
      || typeof raw.label !== "string" || raw.label.length === 0
      || typeof raw.type !== "string" || !SUPPORTED_FIELD_TYPES.has(raw.type as DocumentFieldType)
      || typeof raw.required !== "boolean"
      || ids.has(raw.id)) {
      throw new Error("Invalid document extraction field");
    }
    ids.add(raw.id);
    return {
      id: raw.id,
      label: raw.label,
      type: raw.type as DocumentFieldType,
      required: raw.required,
      ...optionalString(raw, "description"),
      ...optionalStringArray(raw, "aliases"),
      ...optionalString(raw, "formatHint"),
      ...optionalExamples(raw)
    };
  });
  return { schemaName, expectedDocumentType, fields };
}

export function determineDocumentStatus(
  answer: DocumentRequirementAnswer,
  schema: DocumentExtractionSchema
): "EXTRACTED" | "NEEDS_REVIEW" {
  if (!answer.documentMatch.matches) return "NEEDS_REVIEW";
  for (const definition of schema.fields) {
    const status = answer.fields[definition.id]?.status;
    if (status === "NEEDS_REVIEW" || (definition.required && status === "MISSING")) return "NEEDS_REVIEW";
  }
  return "EXTRACTED";
}

export function normalizeRequirementAnswer(
  answer: DocumentRequirementAnswer,
  schema: DocumentExtractionSchema
): DocumentRequirementAnswer {
  if (!isRecord(answer) || !isRecord(answer.documentMatch)
    || typeof answer.documentMatch.matches !== "boolean"
    || !(typeof answer.documentMatch.detectedType === "string" || answer.documentMatch.detectedType === null)
    || !isRecord(answer.fields)) {
    throw new Error("Invalid document extraction answer");
  }

  const expectedIds = schema.fields.map((field) => field.id);
  const actualIds = Object.keys(answer.fields);
  if (actualIds.length !== expectedIds.length || actualIds.some((id) => !expectedIds.includes(id))) {
    throw new Error("Document extraction answer field IDs do not match Schema");
  }

  const fields: DocumentRequirementAnswer["fields"] = {};
  for (const definition of schema.fields) {
    const extracted = answer.fields[definition.id];
    if (!isRecord(extracted)
      || !["EXTRACTED", "MISSING", "NEEDS_REVIEW"].includes(String(extracted.status))) {
      throw new Error(`Invalid extraction result for ${definition.id}`);
    }
    if (!answer.documentMatch.matches) {
      fields[definition.id] = { value: null, status: "MISSING" };
      continue;
    }
    const status = extracted.status as "EXTRACTED" | "MISSING" | "NEEDS_REVIEW";
    const value = status === "MISSING" ? null : normalizeFieldValue(definition.type, extracted.value);
    fields[definition.id] = value === null
      ? { value: null, status: status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "MISSING" }
      : { value, status };
  }
  return {
    documentMatch: {
      matches: answer.documentMatch.matches,
      detectedType: answer.documentMatch.detectedType
    },
    fields
  };
}

function normalizeFieldValue(type: DocumentFieldType, value: unknown): string | number | boolean | null {
  if (value === null) return null;
  if (type === "TEXT") return typeof value === "string" ? value : invalidValue(type);
  if (type === "NUMBER" || type === "CURRENCY") {
    return typeof value === "number" && Number.isFinite(value) ? value : invalidValue(type);
  }
  if (type === "BOOLEAN") return typeof value === "boolean" ? value : invalidValue(type);
  if (type === "DATE") {
    return typeof value === "string" && isIsoDate(value) ? value : invalidValue(type);
  }
  return invalidValue(type);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function invalidValue(type: DocumentFieldType): never {
  throw new Error(`Invalid ${type} extraction value`);
}

function parseSupportedMimeType(value: string): DocumentVisionInput["mimeType"] {
  if (value === "application/pdf" || value === "image/jpeg" || value === "image/png") return value;
  throw new Error(`Unsupported document MIME type: ${value}`);
}

function optionalString(raw: Record<string, any>, key: "description" | "formatHint"): Record<string, string> {
  const value = raw[key];
  if (value === undefined) return {};
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Invalid document extraction field ${key}`);
  return { [key]: value };
}

function optionalStringArray(raw: Record<string, any>, key: "aliases"): Record<string, string[]> {
  const value = raw[key];
  if (value === undefined) return {};
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`Invalid document extraction field ${key}`);
  }
  return { [key]: value };
}

function optionalExamples(raw: Record<string, any>): { examples?: Array<string | number | boolean> } {
  if (raw.examples === undefined) return {};
  if (!Array.isArray(raw.examples) || raw.examples.some((item: unknown) => !["string", "number", "boolean"].includes(typeof item))) {
    throw new Error("Invalid document extraction field examples");
  }
  return { examples: raw.examples };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

