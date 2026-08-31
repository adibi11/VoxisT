import { DocumentVisionInput } from "../Documents/documentProcessingTypes";
import { InboundDocumentCandidate } from "./inboundEmailTypes";

export type InboundDocumentClassificationConfidence = "HIGH" | "MEDIUM" | "LOW";

export type InboundDocumentClassification = {
  caseDocumentSpecificationId: number | null;
  confidence: InboundDocumentClassificationConfidence;
};

export interface IInboundDocumentClassifier {
  classify(
    document: DocumentVisionInput,
    candidates: InboundDocumentCandidate[]
  ): Promise<InboundDocumentClassification>;
}
