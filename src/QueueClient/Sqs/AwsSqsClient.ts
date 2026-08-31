import { DeleteMessageCommand, GetQueueUrlCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { ISqsClient, SqsMessage } from "./ISqsClient";

export const S3_DOCUMENT_QUEUE_NAME = "S3_DOCUMENT_QUEUE";

export class AwsSqsClient implements ISqsClient {
  private queueUrl?: string;
  constructor(private readonly client: SQSClient, private readonly queueName = S3_DOCUMENT_QUEUE_NAME) {}

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env, queueName = S3_DOCUMENT_QUEUE_NAME): AwsSqsClient {
    const region = env.AWS_REGION?.trim();
    if (!region) throw new Error("AWS_REGION is required");
    return new AwsSqsClient(new SQSClient({ region }), queueName);
  }
  async receiveMessages(): Promise<SqsMessage[]> {
    const result = await this.client.send(new ReceiveMessageCommand({ QueueUrl: await this.getQueueUrl(), MaxNumberOfMessages: 10, WaitTimeSeconds: 20 }));
    return (result.Messages ?? []).flatMap((message) => message.ReceiptHandle ? [{ messageId: message.MessageId, receiptHandle: message.ReceiptHandle, body: message.Body }] : []);
  }
  async deleteMessage(receiptHandle: string): Promise<void> {
    await this.client.send(new DeleteMessageCommand({ QueueUrl: await this.getQueueUrl(), ReceiptHandle: receiptHandle }));
  }
  private async getQueueUrl(): Promise<string> {
    if (this.queueUrl) return this.queueUrl;
    const result = await this.client.send(new GetQueueUrlCommand({ QueueName: this.queueName }));
    if (!result.QueueUrl) throw new Error(`SQS queue not found: ${this.queueName}`);
    this.queueUrl = result.QueueUrl;
    return result.QueueUrl;
  }
}
