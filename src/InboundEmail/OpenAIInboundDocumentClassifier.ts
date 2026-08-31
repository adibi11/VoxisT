import OpenAI from "openai";
import { DocumentVisionInput } from "../Documents/documentProcessingTypes";
import { ILogger } from "../logging/logger";
import { IInboundDocumentClassifier, InboundDocumentClassification } from "./InboundDocumentClassifier";
import { InboundDocumentCandidate } from "./inboundEmailTypes";
import { CLASSIFICATION_PROMPT_VERSION, classificationInstructions } from "../Documents/Vision/DocumentVisionPrompts";

const INBOUND_CLASSIFICATION_MODEL = "gpt-4.1-mini";

export class OpenAIInboundDocumentClassifier implements IInboundDocumentClassifier {
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

  async classify(
    document: DocumentVisionInput,
    candidates: InboundDocumentCandidate[]
  ): Promise<InboundDocumentClassification> {
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

    this.logger.info("inbound_email.classification.requested", {
      model: INBOUND_CLASSIFICATION_MODEL,
      mimeType: document.mimeType,
      sizeBytes: document.bytes.byteLength,
      language: document.language,
      candidateIds: candidates.map((candidate) => candidate.caseDocumentSpecificationId),
      promptVersion: CLASSIFICATION_PROMPT_VERSION
    });
    const response = await this.client.responses.create({
      model: INBOUND_CLASSIFICATION_MODEL,
      instructions: classificationInstructions(document.language),
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: `Business language: ${document.language}\nCandidates: ${JSON.stringify(candidates)}` },
          documentContent
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "inbound_document_classification",
          strict: true,
          schema: inboundDocumentClassificationJsonSchema()
        }
      }
    });
    if (!response.output_text) throw new Error("OpenAI returned no inbound document classification output");
    const result = JSON.parse(response.output_text) as InboundDocumentClassification;
    this.logger.info("inbound_email.classification.succeeded", {
      model: INBOUND_CLASSIFICATION_MODEL,
      language: document.language,
      candidateIds: candidates.map((candidate) => candidate.caseDocumentSpecificationId),
      returnedCandidateId: result.caseDocumentSpecificationId,
      confidence: result.confidence,
      matched: result.caseDocumentSpecificationId !== null,
      promptVersion: CLASSIFICATION_PROMPT_VERSION,
      providerRequestId: (response as { _request_id?: string })._request_id
    });
    return result;
  }
}

export function inboundDocumentClassificationJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["caseDocumentSpecificationId", "confidence"],
    properties: {
      caseDocumentSpecificationId: { type: ["integer", "null"] },
      confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }
    }
  };
}
