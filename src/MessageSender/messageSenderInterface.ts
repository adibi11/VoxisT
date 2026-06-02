import { CommunicationChannel, MessageProvider } from "../dataClients/Types/apiTypes";

export type OutboundMessage = {
  channel: CommunicationChannel;
  provider: MessageProvider;
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
