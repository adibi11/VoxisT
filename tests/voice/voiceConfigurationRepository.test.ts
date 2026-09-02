import { describe, expect, it, vi } from "vitest";
import { VoiceConfigurationRepository } from "../../src/Voice/State/VoiceConfigurationRepository";

describe("VoiceConfigurationRepository", () => {
  it("keeps escalation policy separate from BusinessChannel provider configuration", async () => {
    const prisma = {
      businessFollowUpPolicy: {
        findUnique: vi.fn().mockResolvedValue({
          caseDocumentVoiceEnabled: true,
          caseDocumentVoiceThresholdDays: 3
        })
      },
      businessChannel: {
        findUnique: vi.fn().mockResolvedValue({
          status: "active",
          provider: "elevenlabs",
          externalPhoneNumberId: "number-id",
          config: { agentId: "agent-id" }
        })
      }
    };
    const repository = new VoiceConfigurationRepository(prisma as any);

    await expect(repository.get(7)).resolves.toEqual({
      enabled: true,
      thresholdDays: 3,
      providerEnabled: true,
      providerConfigured: true,
      provider: "elevenlabs",
      outboundNumberId: "number-id",
      agentId: "agent-id"
    });
    expect(prisma.businessChannel.findUnique).toHaveBeenCalledWith({
      where: {
        businessId_channel_provider: { businessId: 7, channel: "voice", provider: "elevenlabs" }
      }
    });
  });
});
