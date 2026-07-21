import { PrismaClient } from "../../../../generated/prisma/client";
import { MetaLeadFormSubscriptionDto } from "../../../Types/leadIngestionTypes";
import { IMetaLeadFormSubscriptionRepository } from "./IMetaLeadFormSubscriptionRepository";

export class MetaLeadFormSubscriptionRepository implements IMetaLeadFormSubscriptionRepository {
    constructor(private readonly prisma: PrismaClient) {}
    async listByConnection(integrationConnectionId: number): Promise<MetaLeadFormSubscriptionDto[]> { return (await this.prisma.metaLeadFormSubscription.findMany({ where: { integrationConnectionId }, orderBy: [{ pageName: "asc" }, { formName: "asc" }] })).map(map); }
    async getActiveByPageAndForm(pageId: string, formId: string): Promise<MetaLeadFormSubscriptionDto | null> {
        const rows = await this.prisma.metaLeadFormSubscription.findMany({ where: { pageId, formId, status: "ACTIVE", integrationConnection: { status: "ACTIVE" } } });
        if (rows.length > 1) throw new Error(`Meta form ${formId} is connected more than once`);
        return rows[0] ? map(rows[0]) : null;
    }
    async upsert(input: Omit<MetaLeadFormSubscriptionDto, "id" | "status" | "createdAt" | "updatedAt">): Promise<MetaLeadFormSubscriptionDto> {
        return map(await this.prisma.metaLeadFormSubscription.upsert({
            where: { integrationConnectionId_formId: { integrationConnectionId: input.integrationConnectionId, formId: input.formId } },
            create: { ...input, status: "ACTIVE" }, update: { pageId: input.pageId, pageName: input.pageName, formName: input.formName, status: "ACTIVE" }
        }));
    }
    async disable(id: number, integrationConnectionId: number): Promise<MetaLeadFormSubscriptionDto | null> {
        const result = await this.prisma.metaLeadFormSubscription.updateMany({ where: { id, integrationConnectionId }, data: { status: "DISABLED" } });
        if (!result.count) return null;
        const row = await this.prisma.metaLeadFormSubscription.findUnique({ where: { id } }); return row ? map(row) : null;
    }
    async disableAll(integrationConnectionId: number): Promise<void> { await this.prisma.metaLeadFormSubscription.updateMany({ where: { integrationConnectionId, status: "ACTIVE" }, data: { status: "DISABLED" } }); }
    async countActiveByPage(integrationConnectionId: number, pageId: string): Promise<number> { return this.prisma.metaLeadFormSubscription.count({ where: { integrationConnectionId, pageId, status: "ACTIVE" } }); }
}
function map(row: any): MetaLeadFormSubscriptionDto { return { id: row.id, integrationConnectionId: row.integrationConnectionId, pageId: row.pageId, pageName: row.pageName, formId: row.formId, formName: row.formName, status: row.status, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
