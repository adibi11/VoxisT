export type SqsMessage = {
  messageId?: string;
  receiptHandle: string;
  body?: string;
};

export interface ISqsClient {
  receiveMessages(): Promise<SqsMessage[]>;
  deleteMessage(receiptHandle: string): Promise<void>;
}
