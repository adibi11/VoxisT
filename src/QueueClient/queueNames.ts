export const MESSAGE_QUEUE_NAME = "message-queue";
export const OUTBOUND_MESSAGE_QUEUE_NAME = "outbound-message-queue";

export function getBullMqPrefix(queueName: string): string {
  return `{${queueName}}`;
}
