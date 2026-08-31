import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import {
    BusinessChannelCredentialsDto,
    BusinessChannelDto,
    BusinessChannelOnboardingTypeDto,
    SmsSettingsDto,
    BusinessChannelStatusDto,
    UpdateSmsSettingsRequestDto,
    UpsertBusinessChannelRequestDto
} from "../../../../contracts";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../../../../LeadIngestion/integrationSecret";
import { normalizePhoneDigits } from "../../../Types/phoneNumber";
import {
    IBusinessChannelRepository,
    PersistSmsProviderResources,
    ResolvedBusinessChannel,
    SmsProviderConfiguration
} from "./IBusinessChannelRepository";

// Channels in these states must not receive or send traffic.
const UNUSABLE_CHANNEL_STATUSES = ["disabled", "failed"];

export class BusinessChannelRepository implements IBusinessChannelRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async GetChannelsByBusinessId(businessId: number): Promise<BusinessChannelDto[]> {
        const channels = await this.prisma.businessChannel.findMany({
            where: {
                businessId
            },
            orderBy: {
                createdAt: "asc"
            }
        });

        return channels.map(mapPrismaBusinessChannelToDto);
    }

    async UpsertChannelByBusinessId(
        businessId: number,
        channelDto: UpsertBusinessChannelRequestDto
    ): Promise<BusinessChannelDto> {
        const normalizedChannel = normalizeRequiredString(channelDto.channel, "channel");
        const normalizedProvider = normalizeRequiredString(channelDto.provider, "provider");
        const credentialsEncrypted = encryptCredentials(channelDto.credentials);

        const channel = await this.prisma.businessChannel.upsert({
            where: {
                businessId_channel_provider: {
                    businessId,
                    channel: normalizedChannel,
                    provider: normalizedProvider
                }
            },
            create: {
                businessId,
                channel: normalizedChannel,
                provider: normalizedProvider,
                displayName: normalizeNullableString(channelDto.displayName),
                status: channelDto.status || "pending",
                onboardingType: channelDto.onboardingType || "manual",
                config: channelDto.config === undefined ? undefined : toPrismaJson(channelDto.config),
                externalAccountId: normalizeNullableString(channelDto.externalAccountId),
                externalPhoneNumberId: normalizeNullableString(channelDto.externalPhoneNumberId),
                webhookUrl: normalizeNullableString(channelDto.webhookUrl),
                isDefault: channelDto.isDefault ?? false,
                credentialsEncrypted: credentialsEncrypted === undefined ? null : credentialsEncrypted
            },
            update: {
                displayName: channelDto.displayName === undefined ? undefined : normalizeNullableString(channelDto.displayName),
                status: channelDto.status,
                onboardingType: channelDto.onboardingType,
                config: channelDto.config === undefined ? undefined : toPrismaJson(channelDto.config),
                externalAccountId: channelDto.externalAccountId === undefined ? undefined : normalizeNullableString(channelDto.externalAccountId),
                externalPhoneNumberId: channelDto.externalPhoneNumberId === undefined ? undefined : normalizeNullableString(channelDto.externalPhoneNumberId),
                webhookUrl: channelDto.webhookUrl === undefined ? undefined : normalizeNullableString(channelDto.webhookUrl),
                isDefault: channelDto.isDefault,
                credentialsEncrypted
            }
        });

        return mapPrismaBusinessChannelToDto(channel);
    }

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

    async GetChannelForInbound(provider: string, receivingAddress: string): Promise<ResolvedBusinessChannel | null> {
        const targetDigits = normalizePhoneDigits(receivingAddress);
        if (!targetDigits) {
            return null;
        }

        const candidates = await this.prisma.businessChannel.findMany({
            where: {
                provider,
                status: { notIn: UNUSABLE_CHANNEL_STATUSES },
                externalPhoneNumberId: { not: null }
            },
            orderBy: { id: "asc" }
        });

        const match = candidates.find(
            (channel) => normalizePhoneDigits(channel.externalPhoneNumberId) === targetDigits
        );

        return match ? toResolvedChannel(match) : null;
    }

    async GetChannelForOutbound(
        businessId: number,
        channel: string,
        provider: string,
        fromAddress?: string
    ): Promise<ResolvedBusinessChannel | null> {
        const candidates = await this.prisma.businessChannel.findMany({
            where: {
                businessId,
                channel,
                provider,
                status: channel === "sms" ? "active" : { notIn: UNUSABLE_CHANNEL_STATUSES }
            },
            orderBy: { id: "asc" }
        });

        if (candidates.length === 0) {
            return null;
        }

        const fromDigits = normalizePhoneDigits(fromAddress);
        const byFromNumber = fromDigits
            ? candidates.find((channel) => normalizePhoneDigits(channel.externalPhoneNumberId) === fromDigits)
            : undefined;
        const match = byFromNumber || candidates.find((channel) => channel.isDefault) || candidates[0];

        return toResolvedChannel(match);
    }
}

function encryptCredentials(
    credentials: BusinessChannelCredentialsDto | null | undefined
): string | null | undefined {
    if (credentials === undefined) {
        return undefined; // keep whatever is stored
    }

    if (credentials === null) {
        return null; // explicit removal
    }

    return encryptIntegrationSecret(JSON.stringify(credentials));
}

function toResolvedChannel(channel: PrismaBusinessChannelForDto): ResolvedBusinessChannel {
    return {
        channel: mapPrismaBusinessChannelToDto(channel),
        credentials: decryptCredentials(channel.credentialsEncrypted)
    };
}

function decryptCredentials(credentialsEncrypted: string | null): BusinessChannelCredentialsDto | null {
    if (!credentialsEncrypted) {
        return null;
    }

    const decrypted = decryptIntegrationSecret(credentialsEncrypted);
    return JSON.parse(decrypted) as BusinessChannelCredentialsDto;
}

type PrismaBusinessChannelForDto = {
    id: number;
    businessId: number;
    channel: string;
    provider: string;
    displayName: string | null;
    status: string;
    onboardingType: string;
    credentialsEncrypted: string | null;
    config: Prisma.JsonValue | null;
    externalAccountId: string | null;
    externalPhoneNumberId: string | null;
    messagingServiceSid: string | null;
    alphaSenderSid: string | null;
    webhookUrl: string | null;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
};

function mapPrismaBusinessChannelToDto(channel: PrismaBusinessChannelForDto): BusinessChannelDto {
    return {
        id: channel.id,
        businessId: channel.businessId,
        channel: channel.channel,
        provider: channel.provider,
        displayName: channel.displayName,
        status: channel.status as BusinessChannelStatusDto,
        onboardingType: channel.onboardingType as BusinessChannelOnboardingTypeDto,
        config: channel.config,
        externalAccountId: channel.externalAccountId,
        externalPhoneNumberId: channel.externalPhoneNumberId,
        messagingServiceConfigured: Boolean(channel.messagingServiceSid),
        webhookUrl: channel.webhookUrl,
        isDefault: channel.isDefault,
        hasCredentials: Boolean(channel.credentialsEncrypted),
        createdAt: channel.createdAt.toISOString(),
        updatedAt: channel.updatedAt.toISOString()
    };
}

function normalizeRequiredString(value: string | undefined, fieldName: string): string {
    const normalizedValue = value?.trim();
    if (!normalizedValue) {
        throw new Error(`${fieldName} is required`);
    }

    return normalizedValue;
}

function normalizeNullableString(value?: string | null): string | null {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : null;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}
