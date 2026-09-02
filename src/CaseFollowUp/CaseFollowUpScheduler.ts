import { ILogger, logger } from "../logging/logger";
import { ICaseFollowUpQueue } from "../QueueClient/caseFollowUpQueue";
import {
  CaseFollowUpCandidate,
  ICaseFollowUpRepository
} from "../dataClients/SqlClient/Repositories/CaseFollowUpRepo/ICaseFollowUpRepository";
import { CaseMissingRequirementResolver } from "./CaseMissingRequirementResolver";
import { isActiveCase, resolveCaseClientPhone } from "./caseFollowUpTypes";

export type CaseFollowUpSchedulerOptions = {
  intervalMs?: number;
  pageSize?: number;
};

export type CaseFollowUpSchedulerResult = {
  examined: number;
  created: number;
  duplicates: number;
};

export type CaseFollowUpLocalTime = {
  dateKey: string;
  hour: number;
  minute: number;
};

export class CaseFollowUpScheduler {
  private readonly intervalMs: number;
  private readonly pageSize: number;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly repository: ICaseFollowUpRepository,
    private readonly queue: ICaseFollowUpQueue,
    private readonly missingResolver: CaseMissingRequirementResolver,
    private readonly schedulerLogger: ILogger = logger.child({ component: "CaseFollowUpScheduler" }),
    options: CaseFollowUpSchedulerOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? 60_000;
    this.pageSize = options.pageSize ?? 200;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(
      () => void this.runOnce().catch((error) =>
        this.schedulerLogger.error("case_follow_up.scheduler.tick.failed", {
          errorType: error instanceof Error ? error.name : "UnknownError"
        })
      ),
      this.intervalMs
    );
    void this.runOnce().catch((error) =>
      this.schedulerLogger.error("case_follow_up.scheduler.initial_tick.failed", {
        errorType: error instanceof Error ? error.name : "UnknownError"
      })
    );
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(now: Date = new Date()): Promise<CaseFollowUpSchedulerResult> {
    const result = { examined: 0, created: 0, duplicates: 0 };
    const recovered = await this.repository.recoverAbandoned(now, this.pageSize);
    const recoveredIds = new Set(recovered.map((followUp) => followUp.id));
    for (const followUp of recovered) {
      try {
        await this.queue.enqueue(followUp.id, `recovery-${followUp.attemptCount}`);
      } catch (error) {
        this.schedulerLogger.error("case_follow_up.scheduler.recovery_enqueue.failed", {
          caseFollowUpId: followUp.id,
          errorType: error instanceof Error ? error.name : "UnknownError"
        });
      }
    }
    const pendingIds = await this.repository.listPendingIdsForEnqueue(now, this.pageSize);
    for (const caseFollowUpId of pendingIds) {
      if (recoveredIds.has(caseFollowUpId)) continue;
      try {
        await this.queue.enqueue(caseFollowUpId);
      } catch (error) {
        this.schedulerLogger.error("case_follow_up.scheduler.pending_enqueue.failed", {
          caseFollowUpId,
          errorType: error instanceof Error ? error.name : "UnknownError"
        });
      }
    }

    let afterCaseId: number | null = null;
    while (true) {
      const candidates = await this.repository.listSchedulerCandidates(afterCaseId, this.pageSize);
      for (const candidate of candidates) {
        result.examined += 1;
        await this.processCandidate(candidate, now, result);
      }
      if (candidates.length < this.pageSize) break;
      afterCaseId = candidates[candidates.length - 1].caseId;
    }

    this.schedulerLogger.info("case_follow_up.scheduler.tick.completed", result);
    return result;
  }

  private async processCandidate(
    candidate: CaseFollowUpCandidate,
    now: Date,
    result: CaseFollowUpSchedulerResult
  ): Promise<void> {
    const localTime = caseFollowUpLocalTime(now, candidate.policy.timezone);
    if (
      !candidate.policy.enabled
      || candidate.policy.hour === null
      || !localTime
      || localTime.hour < candidate.policy.hour
    ) {
      return;
    }

    const cadenceKey = caseDocumentFollowUpCadenceKey(localTime.dateKey);
    try {
      if (!isActiveCase(candidate.status, candidate.archivedAt)) return;
      if (!candidate.smsConfigured) return;
      if (!resolveCaseClientPhone(candidate.clientPhoneNumber, candidate.leadPhoneNumber)) return;
      const missing = this.missingResolver.resolve(candidate.requirements, now);
      if (missing.length === 0) return;

      const created = await this.repository.createPending(
        candidate.businessId,
        candidate.caseId,
        cadenceKey,
        now
      );
      if (created.outcome === "duplicate") {
        result.duplicates += 1;
        return;
      }

      await this.queue.enqueue(created.id);
      result.created += 1;
      this.schedulerLogger.info("case_follow_up.scheduler.created", {
        caseFollowUpId: created.id,
        caseId: candidate.caseId,
        businessId: candidate.businessId,
        missingRequirementCount: missing.length,
        cadenceKey
      });
    } catch (error) {
      this.schedulerLogger.error("case_follow_up.scheduler.case.failed", {
        caseId: candidate.caseId,
        businessId: candidate.businessId,
        cadenceKey,
        errorType: error instanceof Error ? error.name : "UnknownError"
      });
    }
  }
}

export function caseDocumentFollowUpCadenceKey(localDateKey: string): string {
  return `case-document:${localDateKey}`;
}

export function caseFollowUpLocalTime(date: Date, timezone: string): CaseFollowUpLocalTime | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes): string | undefined =>
      parts.find((part) => part.type === type)?.value;
    const year = value("year");
    const month = value("month");
    const day = value("day");
    const hour = Number(value("hour"));
    const minute = Number(value("minute"));
    if (!year || !month || !day || !Number.isInteger(hour) || !Number.isInteger(minute)) {
      return null;
    }
    return { dateKey: `${year}-${month}-${day}`, hour, minute };
  } catch {
    return null;
  }
}
