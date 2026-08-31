import {
    BusinessChannelCredentialsDto,
    BusinessChannelDto,
    SmsSettingsDto,
    UpdateSmsSettingsRequestDto,
    UpsertBusinessChannelRequestDto
} from "../../../../contracts";

// A channel row together with its decrypted provider credentials. Only ever
// used server-side (webhook validation, outbound sending) - never serialized
// into an API response.
export type ResolvedBusinessChannel = {
    channel: BusinessChannelDto;
    credentials: BusinessChannelCredentialsDto | null;
};

export type SmsProviderConfiguration = SmsSettingsDto & {
    messagingServiceSid: string | null;
    alphaSenderSid: string | null;
};

export type PersistSmsProviderResources = {
    messagingServiceSid: string;
    alphaSenderSid: string;
};

export interface IBusinessChannelRepository {
    GetChannelsByBusinessId(businessId: number): Promise<BusinessChannelDto[]>;
    UpsertChannelByBusinessId(businessId: number, channelDto: UpsertBusinessChannelRequestDto): Promise<BusinessChannelDto>;
    GetSmsSettings(businessId: number): Promise<SmsSettingsDto>;
    GetSmsProviderConfiguration(businessId: number): Promise<SmsProviderConfiguration>;
    UpdateSmsSettings(
        businessId: number,
        settings: UpdateSmsSettingsRequestDto,
        resources?: PersistSmsProviderResources
    ): Promise<SmsSettingsDto>;
    // Inbound: match the webhook's receiving address ("To") to a channel to
    // learn which business the message belongs to and which auth secret
    // signs the request. provider is optional because the address alone is
    // globally unique per provider network.
    GetChannelForInbound(provider: string, receivingAddress: string): Promise<ResolvedBusinessChannel | null>;
    // Outbound: pick the sending credentials for a business+channel+provider.
    // SMS must be active. For usable candidates, prefer the channel whose number matches the "from" address, then
    // the default channel, then the first usable one.
    GetChannelForOutbound(businessId: number, channel: string, provider: string, fromAddress?: string): Promise<ResolvedBusinessChannel | null>;
}
