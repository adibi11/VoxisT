export type VoiceProvider = string;

export type VoiceInteractionStatus =
  | "PENDING"
  | "SUBMITTING"
  | "ACCEPTED"
  | "FAILED"
  | "UNKNOWN";

export type VoiceInteractionCorrelation = {
  voiceInteractionId: number;
  businessId: number;
  caseId: number;
  caseFollowUpId: number;
};
