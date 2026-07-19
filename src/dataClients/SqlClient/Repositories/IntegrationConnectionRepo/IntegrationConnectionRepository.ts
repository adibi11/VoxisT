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
