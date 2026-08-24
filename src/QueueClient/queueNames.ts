export const MESSAGE_QUEUE_NAME = "message-queue";
export const OUTBOUND_MESSAGE_QUEUE_NAME = "outbound-message-queue";
export const LEAD_INGESTION_QUEUE_NAME = "lead-ingestion-queue";
export const CASE_FOLLOW_UP_QUEUE_NAME = "case-follow-up-queue";

export function getBullMqPrefix(queueName: string): string {
  return `{${queueName}}`;
}
