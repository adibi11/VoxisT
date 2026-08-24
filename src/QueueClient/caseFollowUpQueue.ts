import { Queue } from "bullmq";
import { connection } from "../dataClients/CacheClient/redis";
import { ILogger, logger } from "../logging/logger";
import { CASE_FOLLOW_UP_QUEUE_NAME, getBullMqPrefix } from "./queueNames";

export type CaseFollowUpJobData = {
  caseFollowUpId: number;
};

export interface ICaseFollowUpQueue {
  enqueue(caseFollowUpId: number): Promise<unknown>;
}

export class CaseFollowUpQueue implements ICaseFollowUpQueue {
  private readonly queue: Queue<CaseFollowUpJobData>;

  constructor(
    private readonly queueLogger: ILogger = logger.child({
      component: "CaseFollowUpQueue",
      queueName: CASE_FOLLOW_UP_QUEUE_NAME
    })
  ) {
    this.queue = new Queue<CaseFollowUpJobData>(CASE_FOLLOW_UP_QUEUE_NAME, {
      connection,
      prefix: getBullMqPrefix(CASE_FOLLOW_UP_QUEUE_NAME)
    });
  }

  async enqueue(caseFollowUpId: number): Promise<unknown> {
    const job = await this.queue.add(
      "send-case-follow-up",
      { caseFollowUpId },
      {
        jobId: `case-follow-up-${caseFollowUpId}`,
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000
      }
    );
    this.queueLogger.info("case_follow_up.queue.enqueued", {
      caseFollowUpId,
      jobId: job.id
    });
    return job;
  }
}
