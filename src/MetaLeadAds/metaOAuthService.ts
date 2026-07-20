import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { redisClient } from "../dataClients/CacheClient/redis";
import { getMetaLeadAdsConfig } from "./metaLeadAdsConfig";

export type MetaOAuthState = { businessId: number; connectionId: number; ownerId: number; expiresAt: number; nonce: string };
export type MetaCredentials = { accessToken: string; pageAccessToken?: string };
export type MetaAuthorizationTicket = { businessId: number; connectionId: number; ownerId: number };

const CONSUME_TICKET_SCRIPT = "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value";

export async function createMetaAuthorizationTicket(input: MetaAuthorizationTicket): Promise<string> {
    const ticket = randomBytes(32).toString("base64url");
    const key = `meta-oauth-ticket:${createHmac("sha256", requiredConfig().oauthStateSecret).update(ticket).digest("hex")}`;
    await redisClient.set(key, JSON.stringify(input), "EX", 5 * 60, "NX");
    return ticket;
}

export async function consumeMetaAuthorizationTicket(ticket: string): Promise<MetaAuthorizationTicket> {
    if (!/^[A-Za-z0-9_-]{40,}$/.test(ticket)) throw new Error("Invalid Meta authorization ticket");
    const key = `meta-oauth-ticket:${createHmac("sha256", requiredConfig().oauthStateSecret).update(ticket).digest("hex")}`;
    const value = await redisClient.eval(CONSUME_TICKET_SCRIPT, 1, key) as string | null;
    if (!value) throw new Error("Expired or already-used Meta authorization ticket");
    return JSON.parse(value) as MetaAuthorizationTicket;
}

export function createMetaOAuthState(input: Omit<MetaOAuthState, "expiresAt" | "nonce">): string {
    const config = requiredConfig();
    const payload: MetaOAuthState = { ...input, expiresAt: Date.now() + 10 * 60 * 1000, nonce: randomBytes(16).toString("base64url") };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${sign(encoded, config.oauthStateSecret)}`;
}

export function verifyMetaOAuthState(value: string): MetaOAuthState {
    const config = requiredConfig();
    const [encoded, signature, ...extra] = value.split(".");
    if (!encoded || !signature || extra.length || !safeEquals(signature, sign(encoded, config.oauthStateSecret))) throw new Error("Invalid Meta OAuth state");
    const state = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as MetaOAuthState;
    if (!Number.isInteger(state.businessId) || !Number.isInteger(state.connectionId) || !Number.isInteger(state.ownerId) || state.expiresAt < Date.now()) throw new Error("Expired Meta OAuth state");
    return state;
}

export function metaAuthorizeUrl(state: string): string {
    const config = requiredConfig();
    const url = new URL(`https://www.facebook.com/${config.graphApiVersion}/dialog/oauth`);
    url.searchParams.set("client_id", config.appId); url.searchParams.set("redirect_uri", config.oauthRedirectUri);
    url.searchParams.set("state", state); url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", process.env.META_OAUTH_SCOPES || "leads_retrieval,pages_show_list,pages_read_engagement,pages_manage_metadata");
    return url.toString();
}

export async function exchangeMetaCode(code: string): Promise<MetaCredentials> {
    const config = requiredConfig();
    const url = new URL(`https://graph.facebook.com/${config.graphApiVersion}/oauth/access_token`);
    url.searchParams.set("client_id", config.appId); url.searchParams.set("client_secret", config.appSecret); 
    url.searchParams.set("redirect_uri", config.oauthRedirectUri); 
    url.searchParams.set("code", code);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Meta OAuth token exchange failed");
    const payload = await response.json() as { access_token?: unknown };
    if (typeof payload.access_token !== "string" || !payload.access_token) throw new Error("Meta OAuth token exchange returned no access token");
    return { accessToken: payload.access_token };
}

export function encryptMetaCredentials(credentials: MetaCredentials): string {
    const key = Buffer.from(requiredConfig().credentialEncryptionKey, "base64");
    if (key.length !== 32) throw new Error("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
    return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptMetaCredentials(value: string): MetaCredentials {
    const [ivText, tagText, ciphertextText] = value.split("."); 
    const key = Buffer.from(requiredConfig().credentialEncryptionKey, "base64");
    if (!ivText || !tagText || !ciphertextText || key.length !== 32) 
        throw new Error("Invalid encrypted Meta credential");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64")); 
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64")), decipher.final()]).toString("utf8")) as MetaCredentials;
}

function requiredConfig() { 
    const config = getMetaLeadAdsConfig(); 
    if (!config) 
        throw new Error("Meta OAuth is not configured"); 
    return config; }
function sign(value: string, secret: string): string {
     return createHmac("sha256", secret).update(value).digest("base64url"); 
    }
function safeEquals(a: string, b: string): boolean { 
    const x = Buffer.from(a); 
    const y = Buffer.from(b); 
    return x.length === y.length && timingSafeEqual(x, y); 
}
