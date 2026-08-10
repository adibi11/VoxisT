import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { redisClient } from "../dataClients/CacheClient/redis";
import { getInstagramConfig } from "./instagramConfig";

export type InstagramCredentials = { accessToken: string; instagramUserId: string; expiresAt: string | null };
type Ticket = { businessId: number; connectionId: number; ownerId: number };
type State = Ticket & { expiresAt: number; nonce: string };
const CONSUME = "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value";

export async function createInstagramAuthorizationTicket(input: Ticket): Promise<string> {
  const ticket = randomBytes(32).toString("base64url");
  await redisClient.set(ticketKey(ticket), JSON.stringify(input), "EX", 300, "NX");
  return ticket;
}
export async function consumeInstagramAuthorizationTicket(ticket: string): Promise<Ticket> {
  if (!/^[A-Za-z0-9_-]{40,}$/.test(ticket)) throw new Error("Invalid Instagram authorization ticket");
  const value = await redisClient.eval(CONSUME, 1, ticketKey(ticket)) as string | null;
  if (!value) throw new Error("Expired or already-used Instagram authorization ticket");
  return JSON.parse(value) as Ticket;
}
export function createInstagramState(input: Ticket): string {
  const payload: State = { ...input, expiresAt: Date.now() + 600000, nonce: randomBytes(16).toString("base64url") };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}
export function verifyInstagramState(value: string): State {
  const [encoded, signature, ...extra] = value.split(".");
  if (!encoded || !signature || extra.length || !safeEquals(signature, sign(encoded))) throw new Error("Invalid Instagram OAuth state");
  const state = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as State;
  if (!Number.isInteger(state.businessId) || !Number.isInteger(state.connectionId) || state.expiresAt < Date.now()) throw new Error("Expired Instagram OAuth state");
  return state;
}
export function instagramAuthorizeUrl(state: string): string {
  const config = getInstagramConfig();
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", config.appId); url.searchParams.set("redirect_uri", config.oauthRedirectUri);
  url.searchParams.set("response_type", "code"); url.searchParams.set("state", state);
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages");
  url.searchParams.set("enable_fb_login", "0"); url.searchParams.set("force_authentication", "1");
  return url.toString();
}
export async function exchangeInstagramCode(code: string): Promise<InstagramCredentials> {
  const config = getInstagramConfig();
  const body = new URLSearchParams({ client_id: config.appId, client_secret: config.appSecret, grant_type: "authorization_code", redirect_uri: config.oauthRedirectUri, code });
  const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body });
  const short = await json<{ access_token?: string; user_id?: number | string }>(shortResponse, "Instagram OAuth exchange failed");
  if (!short.access_token || short.user_id === undefined) throw new Error("Instagram OAuth exchange returned incomplete credentials");
  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token"); longUrl.searchParams.set("client_secret", config.appSecret); longUrl.searchParams.set("access_token", short.access_token);
  const long = await json<{ access_token?: string; expires_in?: number }>(await fetch(longUrl), "Instagram long-lived token exchange failed");
  if (!long.access_token) throw new Error("Instagram long-lived token exchange returned no token");
  return { accessToken: long.access_token, instagramUserId: String(short.user_id), expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null };
}
export function encryptInstagramCredentials(credentials: InstagramCredentials): string {
  const key = encryptionKey(); const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}
export function decryptInstagramCredentials(value: string): InstagramCredentials {
  const [iv, tag, encrypted] = value.split("."); if (!iv || !tag || !encrypted) throw new Error("Invalid Instagram credentials");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64")); decipher.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8"));
}
function ticketKey(ticket: string): string { return `instagram-oauth-ticket:${createHmac("sha256", getInstagramConfig().oauthStateSecret).update(ticket).digest("hex")}`; }
function sign(value: string): string { return createHmac("sha256", getInstagramConfig().oauthStateSecret).update(value).digest("base64url"); }
function safeEquals(a: string, b: string): boolean { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
function encryptionKey(): Buffer { const key = Buffer.from(getInstagramConfig().credentialEncryptionKey, "base64"); if (key.length !== 32) throw new Error("INSTAGRAM_INTEGRATION_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key"); return key; }
async function json<T>(response: Response, message: string): Promise<T> { if (!response.ok) throw new Error(`${message} (${response.status})`); return response.json() as Promise<T>; }