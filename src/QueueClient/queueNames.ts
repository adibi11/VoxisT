export const CASE_FOLLOW_UP_QUEUE_NAME = "case-follow-up-queue";

export function getBullMqPrefix(queueName: string): string {
  return `{${queueName}}`;
}
