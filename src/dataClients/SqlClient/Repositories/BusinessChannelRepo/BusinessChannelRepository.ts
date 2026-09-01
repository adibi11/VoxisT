import { PrismaClient } from "../../../../generated/prisma/client";
import { SmsSettingsDto, UpdateSmsSettingsRequestDto } from "../../../../contracts";
import {
  IBusinessChannelRepository,
  PersistSmsProviderResources,
  SmsProviderConfiguration
} from "./IBusinessChannelRepository";

export class BusinessChannelRepository implements IBusinessChannelRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async GetSmsSettings(businessId: number): Promise<SmsSettingsDto> {
    const configuration = await this.GetSmsProviderConfiguration(businessId);
    return {
      enabled: configuration.enabled,
      senderId: configuration.senderId,
      messagingServiceConfigured: Boolean(configuration.messagingServiceSid)
    };
  }

  async GetSmsProviderConfiguration(businessId: number): Promise<SmsProviderConfiguration> {
    const channel = await this.prisma.businessChannel.findUnique({
      where: { businessId_channel_provider: { businessId, channel: "sms", provider: "twilio" } }
    });
    return {
      enabled: channel?.status === "active",
      senderId: channel?.externalPhoneNumberId ?? null,
      messagingServiceConfigured: Boolean(channel?.messagingServiceSid),
      messagingServiceSid: channel?.messagingServiceSid ?? null,
      alphaSenderSid: channel?.alphaSenderSid ?? null
    };
  }

  async UpdateSmsSettings(
    businessId: number,
    settings: UpdateSmsSettingsRequestDto,
    resources?: PersistSmsProviderResources
  ): Promise<SmsSettingsDto> {
    const channel = await this.prisma.businessChannel.upsert({
      where: { businessId_channel_provider: { businessId, channel: "sms", provider: "twilio" } },
      create: {
        businessId,
        channel: "sms",
        provider: "twilio",
        status: settings.enabled ? "active" : "disabled",
        onboardingType: "manual",
        externalPhoneNumberId: normalizeNullableString(settings.senderId),
        messagingServiceSid: resources?.messagingServiceSid,
        alphaSenderSid: resources?.alphaSenderSid
      },
      update: {
        status: settings.enabled ? "active" : "disabled",
        externalPhoneNumberId: normalizeNullableString(settings.senderId),
        messagingServiceSid: resources?.messagingServiceSid,
        alphaSenderSid: resources?.alphaSenderSid
      }
    });
    return {
      enabled: channel.status === "active",
      senderId: channel.externalPhoneNumberId,
      messagingServiceConfigured: Boolean(channel.messagingServiceSid)
    };
  }
}

function normalizeNullableString(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized || null;
}
