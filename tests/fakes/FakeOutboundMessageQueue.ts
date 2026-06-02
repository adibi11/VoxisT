import { OutboundMessageJobData } from "../../src/dataClients/Types/outboundTypes";
import { IOutboundMessageQueue } from "../../src/QueueClient/queue";

export class FakeOutboundMessageQueue implements IOutboundMessageQueue {
  public jobs: OutboundMessageJobData[] = [];
  public nextError: Error | null = null;

  async addOutboundMessage(jobData: OutboundMessageJobData): Promise<unknown> {
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }

    this.jobs.push({
      message: { ...jobData.message }
    });

    return { id: `fake-outbound-job-${this.jobs.length}` };
  }

  failNextEnqueue(error = new Error("Fake outbound enqueue failed")): void {
    this.nextError = error;
  }
}
