import { Prisma, PrismaClient } from "../../generated/prisma/client";

export type VoiceEscalationConfiguration = {
  enabled: boolean;
  thresholdDays: number | null;
  providerEnabled: boolean;
  providerConfigured: boolean;
  provider: string | null;
  outboundNumberId: string | null;
  agentId: string | null;
};

export type UpdateVoiceConfiguration = {
  enabled: boolean;
  thresholdDays: number | null;
  providerEnabled: boolean;
  provider: string;
  outboundNumberId: string | null;
  agentId: string | null;
};

export interface IVoiceConfigurationRepository {
  get(businessId: number): Promise<VoiceEscalationConfiguration>;
  update(businessId: number, input: UpdateVoiceConfiguration): Promise<VoiceEscalationConfiguration>;
}

export class VoiceConfigurationRepository implements IVoiceConfigurationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(businessId: number): Promise<VoiceEscalationConfiguration> {
    const [policy, channel] = await Promise.all([
      this.prisma.businessFollowUpPolicy.findUnique({ where: { businessId } }),
      this.prisma.businessChannel.findUnique({
        where: {
          businessId_channel_provider: { businessId, channel: "voice", provider: "elevenlabs" }
        }
      })
    ]);
    return mapConfiguration(policy, channel);
  }

  async update(businessId: number, input: UpdateVoiceConfiguration): Promise<VoiceEscalationConfiguration> {
    if (input.enabled && (!Number.isInteger(input.thresholdDays) || input.thresholdDays! < 1)) {
      throw new Error("Voice escalation threshold must be a positive number of days");
    }
    const config = input.agentId ? { agentId: input.agentId.trim() } : Prisma.JsonNull;
    await this.prisma.$transaction([
      this.prisma.businessFollowUpPolicy.upsert({
        where: { businessId },
        create: {
          businessId,
          caseDocumentVoiceEnabled: input.enabled,
          caseDocumentVoiceThresholdDays: input.thresholdDays
        },
        update: {
          caseDocumentVoiceEnabled: input.enabled,
          caseDocumentVoiceThresholdDays: input.thresholdDays
        }
      }),
      this.prisma.businessChannel.upsert({
        where: {
          businessId_channel_provider: {
            businessId,
            channel: "voice",
            provider: input.provider
          }
        },
        create: {
          businessId,
          channel: "voice",
          provider: input.provider,
          status: input.providerEnabled ? "active" : "disabled",
          externalPhoneNumberId: normalize(input.outboundNumberId),
          config,
          isDefault: true
        },
        update: {
          status: input.providerEnabled ? "active" : "disabled",
          externalPhoneNumberId: normalize(input.outboundNumberId),
          config,
          isDefault: true
        }
      })
    ]);
    return this.get(businessId);
  }
}

function mapConfiguration(policy: any, channel: any): VoiceEscalationConfiguration {
  const config = channel?.config && typeof channel.config === "object" && !Array.isArray(channel.config)
    ? channel.config as Record<string, unknown>
    : {};
  const agentId = typeof config.agentId === "string" ? normalize(config.agentId) : null;
  const outboundNumberId = normalize(channel?.externalPhoneNumberId);
  const provider = normalize(channel?.provider);
  return {
    enabled: policy?.caseDocumentVoiceEnabled === true,
    thresholdDays: policy?.caseDocumentVoiceThresholdDays ?? null,
    providerEnabled: channel?.status === "active",
    providerConfigured: channel?.status === "active" && Boolean(provider && outboundNumberId && agentId),
    provider,
    outboundNumberId,
    agentId
  };
}

function normalize(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
