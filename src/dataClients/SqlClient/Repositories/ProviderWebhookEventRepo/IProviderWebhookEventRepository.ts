import { ProviderWebhookEventDto } from "../../../Types/leadIngestionTypes";

export interface IProviderWebhookEventRepository {
    record(input: Omit<ProviderWebhookEventDto, "id" | "status" | "attempts" | "nextAttemptAt" | "lockedUntil" | "workerId" | "lastError" | "failureCode" | "failureDetail" | "receivedAt" | "processedAt">): Promise<{ outcome: "recorded" | "duplicate"; event: ProviderWebhookEventDto }>;
    claimNext(workerId: string, lockDurationMilliseconds: number): Promise<ProviderWebhookEventDto | null>;
    markProcessed(id: number, workerId: string): Promise<boolean>;
    reschedule(id: number, workerId: string, nextAttemptAt: Date, error: string): Promise<boolean>;
    markFailed(id: number, workerId: string, failureCode: string, failureDetail: string): Promise<boolean>;
}
