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

export class TwilioProviderRejectedError extends Error {
  constructor(readonly status: number, readonly providerCode?: string) {
    super("Twilio rejected the message request");
    this.name = "TwilioProviderRejectedError";
  }
}

export class TwilioSendOutcomeUnknownError extends Error {
  constructor() {
    super("Twilio message submission outcome is unknown");
    this.name = "TwilioSendOutcomeUnknownError";
  }
}

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

    const from = message.from;
    const to = message.to;
    this.logger.info("twilio.message.send.requested", {
      channel: message.channel,
      provider: message.provider,
      businessId: message.businessId,
      clientId: message.clientId,
      bodyLength: message.body.length
    });


    let response: Response;
    try {
      response = await fetch(this.messagesUrl(), {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          ...(message.messagingServiceSid
            ? { MessagingServiceSid: message.messagingServiceSid }
            : { From: from! }),
          To: to,
          Body: message.body
        })
      });
    } catch {
      throw new TwilioSendOutcomeUnknownError();
    }

    const responseText = await response.text();
    const responseBody = this.parseResponse(responseText);

    if (!response.ok) {
      this.logger.error("twilio.message.send.failed", {
        status: response.status,
        statusText: response.statusText,
        channel: message.channel,
        twilioErrorCode: responseBody.error_code
      });

      throw new TwilioProviderRejectedError(response.status, responseBody.error_code || undefined);
    }

    if (!responseBody.sid) {
      throw new TwilioSendOutcomeUnknownError();
    }

    this.logger.info("twilio.message.send.succeeded", {
      channel: message.channel,
      businessId: message.businessId,
      clientId: message.clientId,
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

    if (message.channel !== CommunicationChannel.Sms) {
      throw new Error(`TwilioMessageSender does not support channel ${message.channel}`);
    }

    if (!message.to || !message.body) {
      throw new Error("TwilioMessageSender requires to and body");
    }
    if (!message.from && !message.messagingServiceSid) {
      throw new Error("TwilioMessageSender requires from or messagingServiceSid for SMS");
    }
    if (message.from && message.messagingServiceSid) {
      throw new Error("TwilioMessageSender accepts either from or messagingServiceSid, not both");
    }
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
