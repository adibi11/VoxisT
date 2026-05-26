export enum OutboundMessageChannel {
  Whatsapp = "whatsapp",
  Sms = "sms",
  Voice = "voice"
}

export type OutboundMessage = {
  channel: OutboundMessageChannel;
  from: string;
  to: string;
  body: string;
  businessId: number;
  clientId: number;
  conversationId: number;
  messageId?: number;
};

export type SendMessageResult = {
  providerMessageId?: string;
  sentAt: Date;
};

export interface IMessageSender {
  sendMessage(message: OutboundMessage): Promise<SendMessageResult>;
}
