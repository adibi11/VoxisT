import { IInstagramRepository } from "./instagramTypes";
import { InstagramCredentials } from "./instagramOAuthService";
import { getInstagramConfig } from "./instagramConfig";

export class InstagramDiscoveryService {
  constructor(private readonly repository: IInstagramRepository) {}

  async synchronize(connectionId: number, credentials: InstagramCredentials): Promise<{ account: any; mediaCount: number }> {
    const config = getInstagramConfig();
    const profile = await get<{ id: string; username: string; name?: string; profile_picture_url?: string }>(`https://graph.instagram.com/${config.graphApiVersion}/me`, credentials.accessToken, "id,username,name,profile_picture_url");
    if (profile.id !== credentials.instagramUserId) throw new Error("Instagram token account does not match the authorized account");
    const account = await this.repository.upsertAccount({ integrationConnectionId: connectionId, instagramUserId: profile.id, username: profile.username, name: profile.name || null, profilePictureUrl: profile.profile_picture_url || null });
    const media = await getAllMedia(config.graphApiVersion, credentials.accessToken);
    await this.repository.upsertMedia(account.id, media.map((item) => ({
      instagramMediaId: item.id, caption: item.caption || null, mediaType: item.media_type,
      mediaUrl: item.media_url || null, thumbnailUrl: item.thumbnail_url || null,
      permalink: item.permalink, publishedAt: new Date(item.timestamp)
    })));
    return { account, mediaCount: media.length };
  }
}

type Media = { id: string; caption?: string; media_type: string; media_url?: string; thumbnail_url?: string; permalink: string; timestamp: string };
async function getAllMedia(version: string, token: string): Promise<Media[]> {
  let url: string | null = `https://graph.instagram.com/${version}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=100`;
  const items: Media[] = [];
  while (url) {
    const page: { data?: Media[]; paging?: { next?: string } } = await getUrl(url, token);
    items.push(...(page.data || [])); url = page.paging?.next || null;
  }
  return items;
}
async function get<T>(url: string, token: string, fields: string): Promise<T> { const target = new URL(url); target.searchParams.set("fields", fields); return getUrl<T>(target.toString(), token); }
async function getUrl<T>(url: string, token: string): Promise<T> { const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error(`Instagram Graph API request failed (${response.status})`); return response.json() as Promise<T>; }