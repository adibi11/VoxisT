export type DocumentFieldType = "TEXT" | "NUMBER" | "CURRENCY" | "DATE" | "BOOLEAN";
export type DocumentFieldStatus = "EXTRACTED" | "MISSING" | "NEEDS_REVIEW";

export type DocumentExtractionField = {
  id: string;
  label: string;
  type: DocumentFieldType;
  required: boolean;
};

export type DocumentExtractionSchema = {
  expectedDocumentType: string;
  schemaName: string;
  fields: DocumentExtractionField[];
};

export type DocumentRequirementAnswer = {
  documentMatch: {
    matches: boolean;
    detectedType: string | null;
  };
  fields: Record<string, {
    value: string | number | boolean | null;
    status: DocumentFieldStatus;
  }>;
};

export type DocumentVisionInput = {
  bytes: Uint8Array;
  filename: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
};

