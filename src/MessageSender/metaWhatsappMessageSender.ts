import { CommunicationChannel, MessageProvider } from "../dataClients/Types/apiTypes";
import { ILogger, logger } from "../logging/logger";
import { IMessageSender, OutboundMessage, SendMessageResult } from "./messageSenderInterface";

type MetaWhatsappMessageSenderOptions = {
  accessToken?: string;
  phoneNumberId?: string;
  graphApiVersion?: string;
  baseUrl?: string;
  logger?: ILogger;
};

type MetaWhatsappSendResponse = {
  messaging_product?: string;
  contacts?: Array<{
    input?: string;
    wa_id?: string;
  }>;
  messages?: Array<{
    id?: string;
    message_status?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export class MetaWhatsappMessageSender implements IMessageSender {
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly graphApiVersion: string;
  private readonly baseUrl: string;
  private readonly logger: ILogger;

  constructor(options: MetaWhatsappMessageSenderOptions = {}) {
    this.accessToken = options.accessToken || process.env.META_WHATSAPP_ACCESS_TOKEN || "";
    this.phoneNumberId = options.phoneNumberId || process.env.META_WHATSAPP_PHONE_NUMBER_ID || "";
    this.graphApiVersion = normalizeGraphApiVersion(
      options.graphApiVersion || process.env.META_GRAPH_API_VERSION || "v20.0"
    );
    this.baseUrl = trimTrailingSlash(options.baseUrl || "https://graph.facebook.com");
    this.logger = options.logger || logger.child({ component: "MetaWhatsappMessageSender" });

    if (!this.accessToken || !this.phoneNumberId) {
      throw new Error("MetaWhatsappMessageSender requires META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID");
    }
  }

  async sendMessage(message: OutboundMessage): Promise<SendMessageResult> {
    this.validateMessage(message);

    const to = normalizeWhatsappRecipient(message.to);

    this.logger.info("meta_whatsapp.message.send.requested", {
      channel: message.channel,
      provider: message.provider,
      businessId: message.businessId,
      clientId: message.clientId,
      conversationId: message.conversationId,
      messageId: message.messageId,
      from: message.from,
      to,
      phoneNumberId: this.phoneNumberId,
      bodyLength: message.body.length
    });

    const response = await fetch(this.messagesUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: false,
          body: message.body
        }
      })
    });

    const responseText = await response.text();
    const responseBody = this.parseResponse(responseText);
    const providerMessage = responseBody.messages?.[0];

    if (!response.ok) {
      this.logger.error("meta_whatsapp.message.send.failed", {
        status: response.status,
        statusText: response.statusText,
        channel: message.channel,
        conversationId: message.conversationId,
        messageId: message.messageId,
        metaErrorCode: responseBody.error?.code,
        metaErrorSubcode: responseBody.error?.error_subcode,
        metaErrorType: responseBody.error?.type,
        metaErrorMessage: responseBody.error?.message,
        metaTraceId: responseBody.error?.fbtrace_id,
        responseBody: responseText.slice(0, 1000)
      });

      throw new Error(`Meta WhatsApp message send failed with status ${response.status}`);
    }

    this.logger.info("meta_whatsapp.message.send.succeeded", {
      channel: message.channel,
      businessId: message.businessId,
      clientId: message.clientId,
      conversationId: message.conversationId,
      messageId: message.messageId,
      providerMessageId: providerMessage?.id,
      providerStatus: providerMessage?.message_status,
      recipientWaId: responseBody.contacts?.[0]?.wa_id
    });

    return {
      providerMessageId: providerMessage?.id,
      sentAt: new Date()
    };
  }

  private validateMessage(message: OutboundMessage): void {
    if (message.provider !== MessageProvider.MetaWhatsapp) {
      throw new Error(`MetaWhatsappMessageSender cannot send provider ${message.provider}`);
    }

    if (message.channel !== CommunicationChannel.Whatsapp) {
      throw new Error(`MetaWhatsappMessageSender does not support channel ${message.channel}`);
    }

    if (!message.to || !message.body) {
      throw new Error("MetaWhatsappMessageSender requires to and body");
    }

    if (!normalizeWhatsappRecipient(message.to)) {
      throw new Error("MetaWhatsappMessageSender requires a valid WhatsApp recipient phone number");
    }
  }

  private messagesUrl(): string {
    return `${this.baseUrl}/${this.graphApiVersion}/${this.phoneNumberId}/messages`;
  }

  private parseResponse(responseText: string): MetaWhatsappSendResponse {
    try {
      return JSON.parse(responseText) as MetaWhatsappSendResponse;
    } catch {
      return {};
    }
  }
}

function normalizeGraphApiVersion(version: string): string {
  const trimmedVersion = version.trim();
  return trimmedVersion.startsWith("v") ? trimmedVersion : `v${trimmedVersion}`;
}

function normalizeWhatsappRecipient(address: string): string {
  return address
    .trim()
    .replace(/^whatsapp:/i, "")
    .replace(/\D/g, "");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
