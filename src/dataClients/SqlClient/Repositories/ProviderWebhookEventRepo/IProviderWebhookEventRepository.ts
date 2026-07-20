import { ProviderWebhookEventDto } from "../../../Types/leadIngestionTypes";

export interface IProviderWebhookEventRepository {
    record(input: Omit<ProviderWebhookEventDto, "id" | "status" | "receivedAt">): Promise<{ outcome: "recorded" | "duplicate"; event: ProviderWebhookEventDto }>;
}
