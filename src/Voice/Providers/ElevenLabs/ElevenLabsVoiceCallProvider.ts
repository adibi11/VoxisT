import {
  IVoiceCallProvider,
  StartVoiceCallInput,
  StartVoiceCallResult,
  VoiceProviderOutcomeUnknownError,
  VoiceProviderRejectedError
} from "../VoiceCallProvider";

type Fetch = typeof fetch;

export type ElevenLabsVoiceCallProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: Fetch;
};

export class ElevenLabsVoiceCallProvider implements IVoiceCallProvider {
  readonly provider = "elevenlabs";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetch: Fetch;

  constructor(options: ElevenLabsVoiceCallProviderOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new Error("ELEVENLABS_API_KEY is required");
    this.baseUrl = (options.baseUrl ?? "https://api.elevenlabs.io").replace(/\/$/, "");
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async startCall(input: StartVoiceCallInput): Promise<StartVoiceCallResult> {
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}/v1/convai/twilio/outbound-call`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "xi-api-key": this.apiKey
        },
        body: JSON.stringify({
          agent_id: input.agentId,
          agent_phone_number_id: input.outboundNumberId,
          to_number: input.recipient,
          conversation_initiation_client_data: {
            dynamic_variables: {
              voxis_business_id: String(input.businessId),
              voxis_case_id: String(input.context.caseId),
              voxis_case_follow_up_id: String(input.caseFollowUpId),
              business_name: input.context.businessName,
              borrower_name: input.context.borrowerName,
              advisor_name: input.context.advisorName ?? "",
              missing_documents: JSON.stringify(input.context.missingDocuments),
              received_documents: JSON.stringify(input.context.receivedDocuments),
              upload_url: input.context.uploadUrl ?? ""
            }
          }
        })
      });
    } catch {
      throw new VoiceProviderOutcomeUnknownError();
    }

    if (!response.ok) {
      if (response.status >= 500 || [408, 409, 425, 429].includes(response.status)) {
        throw new VoiceProviderOutcomeUnknownError();
      }
      throw new VoiceProviderRejectedError(`ELEVENLABS_REJECTED_${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new VoiceProviderOutcomeUnknownError();
    }
    if (!isOutboundCallResponse(body) || body.success !== true) {
      throw new VoiceProviderRejectedError("ELEVENLABS_REJECTED");
    }
    if (!body.conversation_id?.trim()) throw new VoiceProviderOutcomeUnknownError();
    return { providerInteractionId: body.conversation_id, status: "accepted" };
  }
}

function isOutboundCallResponse(value: unknown): value is {
  success: boolean;
  conversation_id?: string | null;
} {
  return typeof value === "object" && value !== null && "success" in value;
}
