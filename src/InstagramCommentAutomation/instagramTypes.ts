export type InstagramAccountInput = { integrationConnectionId: number; instagramUserId: string; username: string; name: string | null; profilePictureUrl: string | null };
export type InstagramMediaInput = { instagramMediaId: string; caption: string | null; mediaType: string; mediaUrl: string | null; thumbnailUrl: string | null; permalink: string; publishedAt: Date };
export type InstagramRuleInput = { instagramMediaId: number; name: string; keywords: string[]; matchType: "ANY_KEYWORD" | "ALL_KEYWORDS" | "EXACT"; publicReplyText: string | null; privateReplyText: string; status: "ENABLED" | "DISABLED" };

export interface IInstagramRepository {
  upsertAccount(input: InstagramAccountInput): Promise<any>;
  getAccountByConnection(businessId: number, connectionId: number): Promise<any | null>;
  upsertMedia(accountId: number, items: InstagramMediaInput[]): Promise<void>;
  listMedia(businessId: number, connectionId: number): Promise<any[]>;
  createRule(businessId: number, connectionId: number, input: InstagramRuleInput): Promise<any>;
  listRules(businessId: number, connectionId: number): Promise<any[]>;
  updateRule(businessId: number, connectionId: number, ruleId: number, input: Partial<InstagramRuleInput>): Promise<any | null>;
}