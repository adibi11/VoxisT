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
    // "bot" jobs are dropped by the outbound worker if a takeover
    // cancellation key exists for the conversation; "human" jobs always
    // bypass that check. Defaults to "bot" for existing call sites.
    origin?: "bot" | "human";
  };
};
