import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import {
    BusinessChannelDto,
    BusinessChannelOnboardingTypeDto,
    BusinessChannelStatusDto,
    UpsertBusinessChannelRequestDto
} from "../../../../contracts";
import { IBusinessChannelRepository } from "./IBusinessChannelRepository";

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
                isDefault: channelDto.isDefault ?? false
            },
            update: {
                displayName: channelDto.displayName === undefined ? undefined : normalizeNullableString(channelDto.displayName),
                status: channelDto.status,
                onboardingType: channelDto.onboardingType,
                config: channelDto.config === undefined ? undefined : toPrismaJson(channelDto.config),
                externalAccountId: channelDto.externalAccountId === undefined ? undefined : normalizeNullableString(channelDto.externalAccountId),
                externalPhoneNumberId: channelDto.externalPhoneNumberId === undefined ? undefined : normalizeNullableString(channelDto.externalPhoneNumberId),
                webhookUrl: channelDto.webhookUrl === undefined ? undefined : normalizeNullableString(channelDto.webhookUrl),
                isDefault: channelDto.isDefault
            }
        });

        return mapPrismaBusinessChannelToDto(channel);
    }
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
