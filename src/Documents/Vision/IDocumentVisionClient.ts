import {
  DocumentExtractionSchema,
  DocumentRequirementAnswer,
  DocumentVisionInput
} from "../documentProcessingTypes";

export interface IDocumentVisionClient {
  extract(
    document: DocumentVisionInput,
    schema: DocumentExtractionSchema
  ): Promise<DocumentRequirementAnswer>;
}

