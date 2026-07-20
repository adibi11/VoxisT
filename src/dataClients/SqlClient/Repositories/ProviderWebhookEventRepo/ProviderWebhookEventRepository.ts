import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import { ProviderWebhookEventDto } from "../../../Types/leadIngestionTypes";
import { IProviderWebhookEventRepository } from "./IProviderWebhookEventRepository";

export class ProviderWebhookEventRepository implements IProviderWebhookEventRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async record(input: Omit<ProviderWebhookEventDto, "id" | "status" | "receivedAt">): Promise<{ outcome: "recorded" | "duplicate"; event: ProviderWebhookEventDto }> {
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
}

function mapEvent(event: any): ProviderWebhookEventDto {
    return { id: event.id, businessId: event.businessId, integrationConnectionId: event.integrationConnectionId, provider: event.provider, eventType: event.eventType, providerEventId: event.providerEventId, payloadHash: event.payloadHash, payload: event.payload, status: event.status, receivedAt: event.receivedAt.toISOString() };
}
