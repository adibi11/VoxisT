import { SmsSettingsDto, UpdateSmsSettingsRequestDto } from "../../../../contracts";

export type SmsProviderConfiguration = SmsSettingsDto & {
  messagingServiceSid: string | null;
  alphaSenderSid: string | null;
};

export type PersistSmsProviderResources = {
  messagingServiceSid: string;
  alphaSenderSid: string;
};

export interface IBusinessChannelRepository {
  GetSmsSettings(businessId: number): Promise<SmsSettingsDto>;
  GetSmsProviderConfiguration(businessId: number): Promise<SmsProviderConfiguration>;
  UpdateSmsSettings(
    businessId: number,
    settings: UpdateSmsSettingsRequestDto,
    resources?: PersistSmsProviderResources
  ): Promise<SmsSettingsDto>;
}
