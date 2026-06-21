import { CommunicationChannel, MessageProvider } from "./apiTypes";

export type OutboundMessageJobData = {
  message: {
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
};
