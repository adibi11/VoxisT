import { CreateIngestionOutboxInput, IngestionOutboxDto } from "../../../Types/leadIngestionTypes";

export interface IIngestionOutboxRepository {
    create(input: CreateIngestionOutboxInput): Promise<IngestionOutboxDto>;
    getPending(limit: number, availableAt?: Date): Promise<IngestionOutboxDto[]>;
    markPublished(outboxId: number): Promise<IngestionOutboxDto>;
    markFailed(outboxId: number, error: string, nextAvailableAt?: Date): Promise<IngestionOutboxDto>;
    reschedule(outboxId: number, error: string, availableAt: Date): Promise<IngestionOutboxDto>;
}
