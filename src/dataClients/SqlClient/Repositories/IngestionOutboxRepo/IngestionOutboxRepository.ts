import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import { CreateIngestionOutboxInput, IngestionOutboxDto } from "../../../Types/leadIngestionTypes";
import { IIngestionOutboxRepository } from "./IIngestionOutboxRepository";

export class IngestionOutboxRepository implements IIngestionOutboxRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async create(input: CreateIngestionOutboxInput): Promise<IngestionOutboxDto> {
        const outbox = await this.prisma.ingestionOutbox.create({ data: { ...input, payload: json(input.payload) } });
        return mapOutbox(outbox);
    }

    async getPending(limit: number, availableAt: Date = new Date()): Promise<IngestionOutboxDto[]> {
        const outbox = await this.prisma.ingestionOutbox.findMany({ where: { status: "PENDING", availableAt: { lte: availableAt } }, orderBy: { availableAt: "asc" }, take: limit });
        return outbox.map(mapOutbox);
    }

    async markPublished(outboxId: number): Promise<IngestionOutboxDto> {
        return mapOutbox(await this.prisma.ingestionOutbox.update({ where: { id: outboxId }, data: { status: "PUBLISHED", publishedAt: new Date(), lastError: null } }));
    }

    async markFailed(outboxId: number, error: string, nextAvailableAt?: Date): Promise<IngestionOutboxDto> {
        return mapOutbox(await this.prisma.ingestionOutbox.update({ where: { id: outboxId }, data: { status: "FAILED", attempts: { increment: 1 }, lastError: error, availableAt: nextAvailableAt } }));
    }

    async reschedule(outboxId: number, error: string, availableAt: Date): Promise<IngestionOutboxDto> {
        return mapOutbox(await this.prisma.ingestionOutbox.update({ where: { id: outboxId }, data: { status: "PENDING", attempts: { increment: 1 }, lastError: error, availableAt } }));
    }
}

function mapOutbox(outbox: any): IngestionOutboxDto {
    return { id: outbox.id, businessId: outbox.businessId, aggregateType: outbox.aggregateType, aggregateId: outbox.aggregateId, eventType: outbox.eventType, payload: outbox.payload, availableAt: outbox.availableAt, status: outbox.status, attempts: outbox.attempts, publishedAt: outbox.publishedAt?.toISOString() || null, lastError: outbox.lastError, createdAt: outbox.createdAt.toISOString(), updatedAt: outbox.updatedAt.toISOString() };
}
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
