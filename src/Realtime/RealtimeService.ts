import crypto from "crypto";
import { ConversationMessageDto } from "../contracts/webContracts";
import { ILogger, logger } from "../logging/logger";
import {
  IRealtimePublisher,
  MESSAGE_CREATED_EVENT,
  MessageCreatedEvent,
  REALTIME_EVENT_VERSION
} from "./realtimeTypes";

export class RealtimeService {
  private readonly logger: ILogger;

  constructor(
    private readonly publisher: IRealtimePublisher,
    loggerInstance: ILogger = logger.child({ component: "RealtimeService" })
  ) {
    this.logger = loggerInstance;
  }

  async publishMessageCreated(
    businessId: number,
    message: ConversationMessageDto
  ): Promise<MessageCreatedEvent> {
    const event: MessageCreatedEvent = {
      eventId: crypto.randomUUID(),
      event: MESSAGE_CREATED_EVENT,
      version: REALTIME_EVENT_VERSION,
      occurredAt: new Date().toISOString(),
      businessId,
      conversationId: message.conversationId,
      message
    };
    const channel = RealtimeService.conversationChannel(message.conversationId);

    try {
      const subscriberCount = await this.publisher.publish(channel, JSON.stringify(event));
      this.logger.info("realtime.message_created.published", {
        eventId: event.eventId,
        businessId,
        conversationId: message.conversationId,
        messageId: message.id,
        subscriberCount
      });
      return event;
    } catch (error) {
      this.logger.error("realtime.message_created.publish_failed", {
        eventId: event.eventId,
        businessId,
        conversationId: message.conversationId,
        messageId: message.id,
        error
      });
      throw error;
    }
  }

  static conversationChannel(conversationId: number): string {
    return `realtime:conversation:${conversationId}`;
  }
}
