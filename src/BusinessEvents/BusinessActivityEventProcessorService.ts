import { PrismaClient, PushDevice } from "../generated/prisma/client";
import { ILogger, logger } from "../logging/logger";
import { NotificationDispatchDto} from "./BusinessEventTypes";
import { notificationStrategyFactory } from "./EventStrategyFactory/EventFactory"

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
    // Using $queryRaw ensures the database executes this as a single atomic operation
    // 'FOR UPDATE SKIP LOCKED' prevents competing workers from fetching the same events
    const events = await this.prisma.$queryRaw<any[]>`
      UPDATE "BusinessActivityEvent"
      SET "state" = 'PROCESSING'
      WHERE "id" IN (
        SELECT "id" 
        FROM "BusinessActivityEvent"
        WHERE "state" = 'PENDING' AND "dueAt" <= ${now}
        ORDER BY "dueAt" ASC, "id" ASC
        LIMIT ${this.pendingEventLimit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "businessId", "aggregateType", "aggregateId", "eventType", "dueAt", "attempts";
    `;

    let eventPayloads: NotificationDispatchDto[] = [];

    // Log the returned rows safely
    for (const event of events) {
      this.serviceLogger.info("business_event.pending", {
        eventId: event.id,
        businessId: event.businessId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        dueAt: new Date(event.dueAt).toISOString(),
        attempts: event.attempts
      });

      eventPayloads.push(await notificationStrategyFactory.resolve(event).execute(event,this.prisma))
    }
    eventPayloads = eventPayloads.filter(e => e.title != "cancelled");
  }

  async mapAllPushDevices(eventPayloads: NotificationDispatchDto[]): Promise<Map<number, PushDevice[]>> {

    const appUserIds = new Set<number>;

    for(const payload of eventPayloads)
    {
      for(const userId in payload.recipients)
      {
        appUserIds.add(Number(userId));
      }
    }

    const devices = await this.prisma.pushDevice.findMany({
        where: {
            appUserId: {
                in: [...appUserIds]
            },
            isActive: true
        }
    });

    const result = new Map<number, PushDevice[]>;
    for (const device of devices) {

        const current =
            result.get(device.appUserId) ?? [];

        current.push(device);

        result.set(device.appUserId, current);

    }
    return result;
  }
}


