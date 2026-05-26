import {
  IMessageSender,
  OutboundMessage,
  SendMessageResult
} from "../../src/MessageSender/messageSenderInterface";

export class FakeMessageSender implements IMessageSender {
  public sentMessages: OutboundMessage[] = [];
  public nextError: Error | null = null;

  async sendMessage(message: OutboundMessage): Promise<SendMessageResult> {
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }

    this.sentMessages.push({ ...message });

    return {
      providerMessageId: `fake-message-${this.sentMessages.length}`,
      sentAt: new Date("2026-05-25T00:00:00.000Z")
    };
  }

  failNextSend(error = new Error("Fake message send failed")): void {
    this.nextError = error;
  }
}
