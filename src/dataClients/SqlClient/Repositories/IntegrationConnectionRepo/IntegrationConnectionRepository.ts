import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import { CreateIntegrationConnectionInput, IntegrationConnectionDto } from "../../../Types/leadIngestionTypes";
import { IIntegrationConnectionRepository } from "./IIntegrationConnectionRepository";

export class IntegrationConnectionRepository implements IIntegrationConnectionRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async create(input: CreateIntegrationConnectionInput): Promise<IntegrationConnectionDto> {
        const connection = await this.prisma.integrationConnection.create({
            data: {
                businessId: input.businessId,
                provider: required(input.provider, "provider"),
                integrationType: input.integrationType,
                status: input.status,
                connectionToken: required(input.connectionToken, "connectionToken"),
                displayName: nullable(input.displayName),
                externalAccountId: nullable(input.externalAccountId),
                externalResourceId: nullable(input.externalResourceId),
                credentialsEncrypted: nullable(input.credentialsEncrypted),
                webhookSecretEncrypted: nullable(input.webhookSecretEncrypted),
                config: jsonOrNull(input.config)
            }
        });
        return mapConnection(connection);
    }

    async getById(businessId: number, connectionId: number): Promise<IntegrationConnectionDto | null> {
        const connection = await this.prisma.integrationConnection.findFirst({ where: { id: connectionId, businessId } });
        return connection ? mapConnection(connection) : null;
    }

    async getByConnectionToken(connectionToken: string): Promise<IntegrationConnectionDto | null> {
        const connection = await this.prisma.integrationConnection.findUnique({ where: { connectionToken } });
        return connection ? mapConnection(connection) : null;
    }

    async getActiveByProviderResource(provider: string, integrationType: IntegrationConnectionDto["integrationType"], externalResourceId: string, pageId?: string): Promise<IntegrationConnectionDto | null> {
        const connections = await this.prisma.integrationConnection.findMany({
            where: { provider, integrationType, externalResourceId, status: "ACTIVE" }
        });
        const matching = connections.filter((connection) => !pageId || (connection.config as { pageId?: unknown } | null)?.pageId === pageId);
        if (matching.length > 1) throw new Error(`Ambiguous active ${provider} integration connection for resource ${externalResourceId}`);
        return matching[0] ? mapConnection(matching[0]) : null;
    }

    async getMetaConnectionByResource(formId: string, pageId: string): Promise<IntegrationConnectionDto | null> {
        const connections = await this.prisma.integrationConnection.findMany({ where: { provider: "meta", integrationType: "LEAD_ADS", externalResourceId: formId, status: { in: ["PENDING", "ACTIVE"] } } });
        const matching = connections.filter((connection) => (connection.config as { pageId?: unknown } | null)?.pageId === pageId);
        if (matching.length > 1) throw new Error(`Ambiguous Meta integration connection for form ${formId}`);
        return matching[0] ? mapConnection(matching[0]) : null;
    }

    async listByBusiness(businessId: number): Promise<IntegrationConnectionDto[]> {
        return (await this.prisma.integrationConnection.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } })).map(mapConnection);
    }

    async saveCredentials(businessId: number, connectionId: number, credentialsEncrypted: string): Promise<IntegrationConnectionDto> {
        return this.updateScoped(businessId, connectionId, { credentialsEncrypted });
    }

    async configureMetaResource(businessId: number, connectionId: number, pageId: string, formId: string, credentialsEncrypted: string): Promise<IntegrationConnectionDto> {
        return this.updateScoped(businessId, connectionId, { externalResourceId: formId, config: { pageId, formId }, credentialsEncrypted });
    }

    async updateStatus(businessId: number, connectionId: number, status: IntegrationConnectionDto["status"]): Promise<IntegrationConnectionDto> {
        return this.updateScoped(businessId, connectionId, { status });
    }

    async getCredentialsEncrypted(businessId: number, connectionId: number): Promise<string | null> {
        const connection = await this.prisma.integrationConnection.findFirst({ where: { id: connectionId, businessId }, select: { credentialsEncrypted: true } });
        return connection?.credentialsEncrypted || null;
    }

    private async updateScoped(businessId: number, connectionId: number, data: Prisma.IntegrationConnectionUncheckedUpdateInput): Promise<IntegrationConnectionDto> {
        const result = await this.prisma.integrationConnection.updateMany({ where: { id: connectionId, businessId }, data });
        if (result.count !== 1) throw new Error(`Integration connection ${connectionId} not found for business ${businessId}`);
        return (await this.getById(businessId, connectionId))!;
    }
}

function mapConnection(connection: any): IntegrationConnectionDto {
    return {
        id: connection.id, businessId: connection.businessId, provider: connection.provider,
        integrationType: connection.integrationType, status: connection.status, connectionToken: connection.connectionToken,
        displayName: connection.displayName, externalAccountId: connection.externalAccountId,
        externalResourceId: connection.externalResourceId, config: connection.config,
        hasCredentials: Boolean(connection.credentialsEncrypted), hasWebhookSecret: Boolean(connection.webhookSecretEncrypted),
        createdAt: connection.createdAt.toISOString(), updatedAt: connection.updatedAt.toISOString()
    };
}

function required(value: string, name: string): string { const normalized = value?.trim(); if (!normalized) throw new Error(`${name} is required`); return normalized; }
function nullable(value?: string | null): string | null { const normalized = value?.trim(); return normalized || null; }
function jsonOrNull(value: unknown): Prisma.InputJsonValue | undefined { return value === undefined || value === null ? undefined : JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
