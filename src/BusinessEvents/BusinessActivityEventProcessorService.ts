import { PrismaClient } from "../generated/prisma/client";
import { ILogger, logger } from "../logging/logger";

export type BusinessActivityEventProcessorOptions = { intervalMs?: number; pendingEventLimit?: number };

/** Read-only processor scaffold. Delivery and state transitions will be added with push notifications. */
export class BusinessActivityEventProcessorService {
  private readonly intervalMs: number;
  private readonly pendingEventLimit: number;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly serviceLogger: ILogger = logger.child({ component: "BusinessActivityEventProcessorService" }),
    options: BusinessActivityEventProcessorOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? 60_000;
    this.pendingEventLimit = options.pendingEventLimit ?? 100;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce().catch((error) => this.serviceLogger.error("business_event.processor.tick.failed", { error })), this.intervalMs);
    void this.runOnce().catch((error) => this.serviceLogger.error("business_event.processor.initial_tick.failed", { error }));
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(now: Date = new Date()): Promise<void> {
    const events = await this.prisma.businessActivityEvent.findMany({
      where: { state: "PENDING", dueAt: { lte: now } },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: this.pendingEventLimit,
      select: { id: true, businessId: true, aggregateType: true, aggregateId: true, eventType: true, dueAt: true, attempts: true }
    });
    for (const event of events) {
      this.serviceLogger.info("business_event.pending", {
        eventId: event.id,
        businessId: event.businessId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        dueAt: event.dueAt.toISOString(),
        attempts: event.attempts
      });
    }
  }
}
