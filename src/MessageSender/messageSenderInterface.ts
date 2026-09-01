import { CommunicationChannel, MessageProvider } from "../dataClients/Types/apiTypes";

export type OutboundMessage = {
  channel: CommunicationChannel;
  provider: MessageProvider;
  from?: string;
  messagingServiceSid?: string;
  to: string;
  body: string;
  businessId: number;
  clientId?: number;
};

export type SendMessageResult = {
  providerMessageId?: string;
  sentAt: Date;
};

export interface IMessageSender {
  sendMessage(message: OutboundMessage): Promise<SendMessageResult>;
}
