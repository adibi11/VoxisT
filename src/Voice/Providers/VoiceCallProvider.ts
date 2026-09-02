import { VoiceCallContext } from "../Context/VoiceCallContext";

export type StartVoiceCallInput = {
  businessId: number;
  caseId: number;
  caseFollowUpId: number;
  idempotencyKey: string;
  recipient: string;
  outboundNumberId: string;
  agentId: string;
  context: VoiceCallContext;
};

export type StartVoiceCallResult = {
  providerInteractionId: string;
  status: string;
};

export interface IVoiceCallProvider {
  readonly provider: string;
  startCall(input: StartVoiceCallInput): Promise<StartVoiceCallResult>;
}

export class VoiceProviderRejectedError extends Error {
  constructor(readonly code = "VOICE_PROVIDER_REJECTED") {
    super("Voice provider rejected the call");
    this.name = "VoiceProviderRejectedError";
  }
}

export class VoiceProviderOutcomeUnknownError extends Error {
  constructor() {
    super("Voice provider submission outcome is unknown");
    this.name = "VoiceProviderOutcomeUnknownError";
  }
}
