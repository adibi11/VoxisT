export type VoiceCallDocumentContext = {
  label: string;
};

export type VoiceCallContext = {
  caseId: number;
  businessName: string;
  borrowerName: string;
  advisorName?: string;
  missingDocuments: VoiceCallDocumentContext[];
  receivedDocuments: VoiceCallDocumentContext[];
  uploadUrl?: string;
};

export interface IVoiceCallContextBuilder {
  build(input: { businessId: number; caseId: number }): Promise<VoiceCallContext | null>;
}
