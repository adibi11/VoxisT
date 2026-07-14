import { OutboundMessageJobData } from "../../src/dataClients/Types/outboundTypes";
import { JobData } from "../../src/dataClients/Types/apiTypes";
import { IOutboundMessageQueue } from "../../src/QueueClient/queue";

export class FakeOutboundMessageQueue implements IOutboundMessageQueue {
  public jobs: OutboundMessageJobData[] = [];
  public events: JobData[] = [];
  public nextError: Error | null = null;

  async addEvent(jobData: JobData): Promise<unknown> {
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }

    this.events.push({
      event: {
        ...jobData.event,
        data: { ...jobData.event.data }
      }
    });

    return { id: `fake-event-job-${this.events.length}` };
  }

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
