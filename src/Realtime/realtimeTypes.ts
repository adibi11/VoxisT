import { ConversationMessageDto } from "../contracts/webContracts";

export const REALTIME_EVENT_VERSION = 1 as const;
export const MESSAGE_CREATED_EVENT = "message.created" as const;

export type MessageCreatedEvent = {
  eventId: string;
  event: typeof MESSAGE_CREATED_EVENT;
  version: typeof REALTIME_EVENT_VERSION;
  occurredAt: string;
  businessId: number;
  conversationId: number;
  message: ConversationMessageDto;
};

export type RealtimeEvent = MessageCreatedEvent;
export type RealtimeEventHandler = (event: RealtimeEvent) => void | Promise<void>;

export interface IRealtimePublisher {
  publish(channel: string, payload: string): Promise<number>;
}

export interface IRealtimeSubscriber {
  subscribeToConversation(
    conversationId: number,
    handler: RealtimeEventHandler
  ): Promise<() => Promise<void>>;
  close(): Promise<void>;
}
