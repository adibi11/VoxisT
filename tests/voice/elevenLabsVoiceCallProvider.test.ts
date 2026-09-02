import { describe, expect, it, vi } from "vitest";
import { ElevenLabsVoiceCallProvider } from "../../src/Voice/Providers/ElevenLabs/ElevenLabsVoiceCallProvider";
import {
  VoiceProviderOutcomeUnknownError,
  VoiceProviderRejectedError
} from "../../src/Voice/Providers/VoiceCallProvider";

const input = {
  businessId: 7,
  caseId: 20,
  caseFollowUpId: 55,
  idempotencyKey: "voice-case-follow-up-55",
  recipient: "+972501234567",
  outboundNumberId: "phone-7",
  agentId: "agent-7",
  context: {
    caseId: 20,
    businessName: "Voxis Finance",
    borrowerName: "Dana",
    advisorName: "Ari",
    missingDocuments: [{ label: "Payslip" }],
    receivedDocuments: [{ label: "ID" }],
    uploadUrl: "https://portal.example/c/token"
  }
};

describe("ElevenLabsVoiceCallProvider", () => {
  it("uses the official Twilio outbound-call contract and returns the conversation ID", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      message: "Call initiated",
      conversation_id: "conv_123",
      callSid: "CA123"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new ElevenLabsVoiceCallProvider({ apiKey: "secret", fetch });

    await expect(provider.startCall(input)).resolves.toEqual({
      providerInteractionId: "conv_123",
      status: "accepted"
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/convai/twilio/outbound-call");
    expect(request.headers).toEqual(expect.objectContaining({ "xi-api-key": "secret" }));
    expect(JSON.parse(request.body)).toEqual(expect.objectContaining({
      agent_id: "agent-7",
      agent_phone_number_id: "phone-7",
      to_number: "+972501234567",
      conversation_initiation_client_data: {
        dynamic_variables: expect.objectContaining({
          voxis_case_id: "20",
          voxis_case_follow_up_id: "55",
          borrower_name: "Dana",
          missing_documents: JSON.stringify([{ label: "Payslip" }])
        })
      }
    }));
  });

  it("treats a client validation response as a definite rejection", async () => {
    const provider = new ElevenLabsVoiceCallProvider({
      apiKey: "secret",
      fetch: vi.fn().mockResolvedValue(new Response("invalid", { status: 422 }))
    });
    await expect(provider.startCall(input)).rejects.toMatchObject<VoiceProviderRejectedError>({
      code: "ELEVENLABS_REJECTED_422"
    });
  });

  it.each([
    ["network failure", vi.fn().mockRejectedValue(new Error("socket closed"))],
    ["server response", vi.fn().mockResolvedValue(new Response("error", { status: 503 }))],
    ["missing conversation ID", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))]
  ])("treats %s as ambiguous and never retries internally", async (_label, fetch) => {
    const provider = new ElevenLabsVoiceCallProvider({ apiKey: "secret", fetch });
    await expect(provider.startCall(input)).rejects.toBeInstanceOf(VoiceProviderOutcomeUnknownError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
