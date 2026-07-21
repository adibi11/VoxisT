import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import { ProviderWebhookEventDto } from "../../../Types/leadIngestionTypes";
import { IProviderWebhookEventRepository } from "./IProviderWebhookEventRepository";

export class ProviderWebhookEventRepository implements IProviderWebhookEventRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async record(input: Omit<ProviderWebhookEventDto, "id" | "status" | "attempts" | "nextAttemptAt" | "lockedUntil" | "workerId" | "lastError" | "failureCode" | "failureDetail" | "receivedAt" | "processedAt">): Promise<{ outcome: "recorded" | "duplicate"; event: ProviderWebhookEventDto }> {
        try {
            const event = await this.prisma.providerWebhookEvent.create({ data: { ...input, payload: JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue } });
            return { outcome: "recorded", event: mapEvent(event) };
        } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
            const event = await this.prisma.providerWebhookEvent.findUnique({ where: { integrationConnectionId_providerEventId: { integrationConnectionId: input.integrationConnectionId, providerEventId: input.providerEventId } } });
            if (!event) throw error;
            return { outcome: "duplicate", event: mapEvent(event) };
        }
    }

    async claimNext(workerId: string, lockDurationMilliseconds: number): Promise<ProviderWebhookEventDto | null> {
        const now = new Date();
        const candidate = await this.prisma.providerWebhookEvent.findFirst({
            where: { OR: [
                { status: "RECEIVED", nextAttemptAt: { lte: now } },
                { status: "PROCESSING", lockedUntil: { lt: now } }
            ] },
            orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }]
        });
        if (!candidate) return null;
        const lockedUntil = new Date(now.getTime() + lockDurationMilliseconds);
        const claimed = await this.prisma.providerWebhookEvent.updateMany({
            where: {
                id: candidate.id,
                OR: [
                    { status: "RECEIVED", nextAttemptAt: { lte: now } },
                    { status: "PROCESSING", lockedUntil: { lt: now } }
                ]
            },
            data: { status: "PROCESSING", workerId, lockedUntil, attempts: { increment: 1 }, lastError: null }
        });
        if (claimed.count !== 1) return null;
        const event = await this.prisma.providerWebhookEvent.findUnique({ where: { id: candidate.id } });
        return event ? mapEvent(event) : null;
    }

    async markProcessed(id: number, workerId: string): Promise<boolean> {
        return (await this.prisma.providerWebhookEvent.updateMany({
            where: { id, status: "PROCESSING", workerId },
            data: { status: "PROCESSED", processedAt: new Date(), lockedUntil: null, workerId: null, lastError: null }
        })).count === 1;
    }

    async reschedule(id: number, workerId: string, nextAttemptAt: Date, error: string): Promise<boolean> {
        return (await this.prisma.providerWebhookEvent.updateMany({
            where: { id, status: "PROCESSING", workerId },
            data: { status: "RECEIVED", nextAttemptAt, lockedUntil: null, workerId: null, lastError: error }
        })).count === 1;
    }

    async markFailed(id: number, workerId: string, failureCode: string, failureDetail: string): Promise<boolean> {
        return (await this.prisma.providerWebhookEvent.updateMany({
            where: { id, status: "PROCESSING", workerId },
            data: { status: "FAILED", lockedUntil: null, workerId: null, lastError: failureDetail, failureCode, failureDetail }
        })).count === 1;
    }
}

function mapEvent(event: any): ProviderWebhookEventDto {
    return { id: event.id, businessId: event.businessId, integrationConnectionId: event.integrationConnectionId, provider: event.provider, eventType: event.eventType, providerEventId: event.providerEventId, payloadHash: event.payload, payload: event.payload, status: event.status, attempts: event.attempts, nextAttemptAt: event.nextAttemptAt.toISOString(), lockedUntil: event.lockedUntil?.toISOString() || null, workerId: event.workerId || null, lastError: event.lastError || null, failureCode: event.failureCode || null, failureDetail: event.failureDetail || null, receivedAt: event.receivedAt.toISOString(), processedAt: event.processedAt?.toISOString() || null };
}
