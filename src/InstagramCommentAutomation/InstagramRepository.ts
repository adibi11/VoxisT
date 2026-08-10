import { Prisma, PrismaClient } from "../generated/prisma/client";
import { IInstagramRepository, InstagramAccountInput, InstagramMediaInput, InstagramRuleInput } from "./instagramTypes";

export class InstagramRepository implements IInstagramRepository {
  constructor(private readonly prisma: PrismaClient) {}

  upsertAccount(input: InstagramAccountInput): Promise<any> {
    return this.prisma.instagramAccount.upsert({
      where: { integrationConnectionId: input.integrationConnectionId },
      create: input,
      update: { instagramUserId: input.instagramUserId, username: input.username, name: input.name, profilePictureUrl: input.profilePictureUrl, lastSyncedAt: new Date() }
    });
  }

  getAccountByConnection(businessId: number, connectionId: number): Promise<any | null> {
    return this.prisma.instagramAccount.findFirst({ where: { integrationConnectionId: connectionId, integrationConnection: { businessId, provider: "instagram", integrationType: "INSTAGRAM_COMMENT_AUTOMATION" } } });
  }

  async upsertMedia(accountId: number, items: InstagramMediaInput[]): Promise<void> {
    await this.prisma.$transaction(items.map((item) => this.prisma.instagramMedia.upsert({
      where: { instagramMediaId: item.instagramMediaId },
      create: { instagramAccountId: accountId, ...item },
      update: { caption: item.caption, mediaType: item.mediaType, mediaUrl: item.mediaUrl, thumbnailUrl: item.thumbnailUrl, permalink: item.permalink, publishedAt: item.publishedAt, lastSyncedAt: new Date() }
    })));
  }

  listMedia(businessId: number, connectionId: number): Promise<any[]> {
    return this.prisma.instagramMedia.findMany({ where: { instagramAccount: { integrationConnectionId: connectionId, integrationConnection: { businessId } } }, orderBy: { publishedAt: "desc" } });
  }

  async createRule(businessId: number, connectionId: number, input: InstagramRuleInput): Promise<any> {
    const media = await this.scopedMedia(businessId, connectionId, input.instagramMediaId);
    if (!media) throw new Error("Instagram media was not found for this connection");
    return this.prisma.instagramCommentAutomationRule.create({ data: { ...input, keywords: input.keywords as Prisma.InputJsonValue } });
  }

  listRules(businessId: number, connectionId: number): Promise<any[]> {
    return this.prisma.instagramCommentAutomationRule.findMany({ where: { instagramMedia: { instagramAccount: { integrationConnectionId: connectionId, integrationConnection: { businessId } } } }, include: { instagramMedia: true }, orderBy: { createdAt: "desc" } });
  }

  async updateRule(businessId: number, connectionId: number, ruleId: number, input: Partial<InstagramRuleInput>): Promise<any | null> {
    const existing = await this.prisma.instagramCommentAutomationRule.findFirst({ where: { id: ruleId, instagramMedia: { instagramAccount: { integrationConnectionId: connectionId, integrationConnection: { businessId } } } } });
    if (!existing) return null;
    if (input.instagramMediaId && !(await this.scopedMedia(businessId, connectionId, input.instagramMediaId))) throw new Error("Instagram media was not found for this connection");
    const data: any = { ...input };
    if (input.keywords) data.keywords = input.keywords as Prisma.InputJsonValue;
    return this.prisma.instagramCommentAutomationRule.update({ where: { id: ruleId }, data });
  }

  private scopedMedia(businessId: number, connectionId: number, mediaId: number): Promise<any | null> {
    return this.prisma.instagramMedia.findFirst({ where: { id: mediaId, instagramAccount: { integrationConnectionId: connectionId, integrationConnection: { businessId } } } });
  }
}