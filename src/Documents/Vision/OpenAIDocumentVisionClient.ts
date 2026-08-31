import OpenAI from "openai";
import { ILogger } from "../../logging/logger";
import {
  DocumentExtractionField,
  DocumentExtractionSchema,
  DocumentRequirementAnswer,
  DocumentVisionInput
} from "../documentProcessingTypes";
import { IDocumentVisionClient } from "./IDocumentVisionClient";
import { EXTRACTION_PROMPT_VERSION, extractionInstructions } from "./DocumentVisionPrompts";

const DOCUMENT_VISION_MODEL = "gpt-4.1-mini";

export class OpenAIDocumentVisionClient implements IDocumentVisionClient {
  private readonly client: OpenAI;

  constructor(private readonly logger: ILogger, client?: OpenAI) {
    if (client) {
      this.client = client;
      return;
    }
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error("OPENAI_API_KEY is required");
    this.client = new OpenAI({ apiKey });
  }

  async extract(
    document: DocumentVisionInput,
    schema: DocumentExtractionSchema
  ): Promise<DocumentRequirementAnswer> {
    this.logger.info("document.vision.requested", {
      model: DOCUMENT_VISION_MODEL,
      mimeType: document.mimeType,
      sizeBytes: document.bytes.byteLength,
      language: document.language,
      documentTypeName: schema.expectedDocumentType,
      schemaName: schema.schemaName,
      fieldIds: schema.fields.map((field) => field.id),
      promptVersion: EXTRACTION_PROMPT_VERSION
    });
    const base64 = Buffer.from(document.bytes).toString("base64");
    const documentContent = document.mimeType === "application/pdf"
      ? {
          type: "input_file" as const,
          filename: document.filename,
          file_data: `data:${document.mimeType};base64,${base64}`
        }
      : {
          type: "input_image" as const,
          detail: "high" as const,
          image_url: `data:${document.mimeType};base64,${base64}`
        };
    const response = await this.client.responses.create({
      model: DOCUMENT_VISION_MODEL,
      instructions: extractionInstructions(document.language),
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Business language: ${document.language}\nExpected document type: ${schema.expectedDocumentType}\nSchema: ${schema.schemaName}\nFields: ${JSON.stringify(schema.fields)}`
          },
          documentContent
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "document_requirement_answer",
          strict: true,
          schema: buildDocumentAnswerJsonSchema(schema)
        }
      }
    });
    if (!response.output_text) throw new Error("OpenAI returned no document extraction output");
    this.logger.info("document.vision.succeeded", {
      model: DOCUMENT_VISION_MODEL,
      language: document.language,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      providerRequestId: (response as { _request_id?: string })._request_id
    });
    return JSON.parse(response.output_text) as DocumentRequirementAnswer;
  }
}

export function buildDocumentAnswerJsonSchema(schema: DocumentExtractionSchema): Record<string, unknown> {
  const fieldProperties = Object.fromEntries(
    schema.fields.map((field) => [field.id, fieldAnswerSchema(field)])
  );
  return {
    type: "object",
    additionalProperties: false,
    required: ["documentMatch", "fields"],
    properties: {
      documentMatch: {
        type: "object",
        additionalProperties: false,
        required: ["matches", "detectedType"],
        properties: {
          matches: { type: "boolean" },
          detectedType: { type: ["string", "null"] }
        }
      },
      fields: {
        type: "object",
        additionalProperties: false,
        required: schema.fields.map((field) => field.id),
        properties: fieldProperties
      }
    }
  };
}

function fieldAnswerSchema(field: DocumentExtractionField): Record<string, unknown> {
  const scalarType = field.type === "TEXT" || field.type === "DATE"
    ? "string"
    : field.type === "BOOLEAN"
      ? "boolean"
      : "number";
  return {
    type: "object",
    additionalProperties: false,
    required: ["value", "status"],
    properties: {
      value: { type: [scalarType, "null"] },
      status: { type: "string", enum: ["EXTRACTED", "MISSING", "NEEDS_REVIEW"] }
    }
  };
}

