import { CommunicationChannel, MessageProvider } from "../dataClients/Types/apiTypes";
import { ILogger, logger } from "../logging/logger";
import { IMessageSender, OutboundMessage, SendMessageResult } from "./messageSenderInterface";

type TwilioMessageSenderOptions = {
  accountSid?: string;
  authToken?: string;
  baseUrl?: string;
  logger?: ILogger;
};

type TwilioSendResponse = {
  sid?: string;
  status?: string;
  error_code?: string | null;
  error_message?: string | null;
};

export class TwilioMessageSender implements IMessageSender {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly baseUrl: string;
  private readonly logger: ILogger;

  constructor(options: TwilioMessageSenderOptions = {}) {
    this.accountSid = options.accountSid || process.env.TWILIO_ACCOUNT_SID || "";
    this.authToken = options.authToken || process.env.TWILIO_AUTH_TOKEN || "";
    this.baseUrl = options.baseUrl || "https://api.twilio.com";
    this.logger = options.logger || logger.child({ component: "TwilioMessageSender" });

    if (!this.accountSid || !this.authToken) {
      throw new Error("TwilioMessageSender requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN");
    }
  }

  async sendMessage(message: OutboundMessage): Promise<SendMessageResult> {
    this.validateMessage(message);

    const from = this.formatAddress(message.channel, message.from);
    const to = this.formatAddress(message.channel, message.to);

    this.logger.info("twilio.message.send.requested", {
      channel: message.channel,
      provider: message.provider,
      businessId: message.businessId,
      clientId: message.clientId,
      conversationId: message.conversationId,
      messageId: message.messageId,
      from,
      to,
      bodyLength: message.body.length
    });

    const response = await fetch(this.messagesUrl(), {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        From: from,
        To: to,
        Body: message.body
      })
    });

    const responseText = await response.text();
    const responseBody = this.parseResponse(responseText);

    if (!response.ok) {
      this.logger.error("twilio.message.send.failed", {
        status: response.status,
        statusText: response.statusText,
        channel: message.channel,
        conversationId: message.conversationId,
        messageId: message.messageId,
        twilioErrorCode: responseBody.error_code,
        twilioErrorMessage: responseBody.error_message,
        responseBody: responseText.slice(0, 1000)
      });

      throw new Error(`Twilio message send failed with status ${response.status}`);
    }

    this.logger.info("twilio.message.send.succeeded", {
      channel: message.channel,
      businessId: message.businessId,
      clientId: message.clientId,
      conversationId: message.conversationId,
      messageId: message.messageId,
      providerMessageId: responseBody.sid,
      providerStatus: responseBody.status
    });

    return {
      providerMessageId: responseBody.sid,
      sentAt: new Date()
    };
  }

  private validateMessage(message: OutboundMessage): void {
    if (message.provider !== MessageProvider.Twilio) {
      throw new Error(`TwilioMessageSender cannot send provider ${message.provider}`);
    }

    if (message.channel !== CommunicationChannel.Whatsapp && message.channel !== CommunicationChannel.Sms) {
      throw new Error(`TwilioMessageSender does not support channel ${message.channel}`);
    }

    if (!message.from || !message.to || !message.body) {
      throw new Error("TwilioMessageSender requires from, to, and body");
    }
  }

  private formatAddress(channel: CommunicationChannel, address: string): string {
    if (channel !== CommunicationChannel.Whatsapp) {
      return address;
    }

    return address.startsWith("whatsapp:") ? address : `whatsapp:${address}`;
  }

  private messagesUrl(): string {
    return `${this.baseUrl}/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
  }

  private authHeader(): string {
    const token = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    return `Basic ${token}`;
  }

  private parseResponse(responseText: string): TwilioSendResponse {
    try {
      return JSON.parse(responseText) as TwilioSendResponse;
    } catch {
      return {};
    }
  }
}
