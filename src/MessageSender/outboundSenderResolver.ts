import { MessageProvider } from "../dataClients/Types/apiTypes";
import { IBusinessChannelRepository } from "../dataClients/SqlClient/Repositories/BusinessChannelRepo/IBusinessChannelRepository";
import { ILogger, logger } from "../logging/logger";
import { IMessageSender, OutboundMessage } from "./messageSenderInterface";
import { MetaWhatsappMessageSender } from "./metaWhatsappMessageSender";
import { TwilioMessageSender } from "./twilioMessageSender";

// Resolves the sender for an outbound message from the business's stored
// channel credentials (matched by the "from" number, then the default
// channel). Falls back to env-configured credentials only for businesses that
// have no channel credentials onboarded yet.
export class OutboundSenderResolver {
  private readonly channelRepository: IBusinessChannelRepository;
  private readonly logger: ILogger;
  // Keyed by channel id for per-business senders, "env:<provider>" for fallbacks.
  private readonly senders = new Map<string, IMessageSender>();

  constructor(channelRepository: IBusinessChannelRepository, loggerInstance: ILogger = logger.child({ component: "OutboundSenderResolver" })) {
    this.channelRepository = channelRepository;
    this.logger = loggerInstance;
  }

  async resolveSender(message: OutboundMessage): Promise<IMessageSender> {
    const resolved = await this.channelRepository.GetChannelForOutbound(
      message.businessId,
      message.provider,
      message.from
    );

    if (resolved?.credentials) {
      const cacheKey = `channel:${resolved.channel.id}:${resolved.channel.updatedAt}`;
      const cached = this.senders.get(cacheKey);
      if (cached) {
        return cached;
      }

      const sender = this.createSenderFromCredentials(message.provider, resolved.credentials);
      this.senders.set(cacheKey, sender);
      this.logger.info("outbound.sender.resolved_from_channel", {
        businessId: message.businessId,
        provider: message.provider,
        channelId: resolved.channel.id
      });
      return sender;
    }

    this.logger.warn("outbound.sender.fallback_to_env", {
      businessId: message.businessId,
      provider: message.provider,
      hasChannelWithoutCredentials: Boolean(resolved)
    });
    return this.getEnvSender(message.provider);
  }

  private createSenderFromCredentials(
    provider: MessageProvider,
    credentials: { accountSid?: string; authToken?: string; accessToken?: string; phoneNumberId?: string }
  ): IMessageSender {
    switch (provider) {
      case MessageProvider.Twilio:
        if (!credentials.accountSid || !credentials.authToken) {
          throw new Error("Twilio channel credentials require accountSid and authToken");
        }
        return new TwilioMessageSender({
          accountSid: credentials.accountSid,
          authToken: credentials.authToken,
          logger: this.logger.child({ component: "TwilioMessageSender" })
        });
      case MessageProvider.MetaWhatsapp:
        if (!credentials.accessToken || !credentials.phoneNumberId) {
          throw new Error("Meta WhatsApp channel credentials require accessToken and phoneNumberId");
        }
        return new MetaWhatsappMessageSender({
          accessToken: credentials.accessToken,
          phoneNumberId: credentials.phoneNumberId,
          logger: this.logger.child({ component: "MetaWhatsappMessageSender" })
        });
      default:
        throw new Error(`No outbound message sender available for provider ${provider}`);
    }
  }

  private getEnvSender(provider: MessageProvider): IMessageSender {
    const cacheKey = `env:${provider}`;
    const cached = this.senders.get(cacheKey);
    if (cached) {
      return cached;
    }

    let sender: IMessageSender;
    switch (provider) {
      case MessageProvider.Twilio:
        sender = new TwilioMessageSender({
          logger: this.logger.child({ component: "TwilioMessageSender" })
        });
        break;
      case MessageProvider.MetaWhatsapp:
        sender = new MetaWhatsappMessageSender({
          logger: this.logger.child({ component: "MetaWhatsappMessageSender" })
        });
        break;
      default:
        throw new Error(`No outbound message sender configured for provider ${provider}`);
    }

    this.senders.set(cacheKey, sender);
    return sender;
  }
}
