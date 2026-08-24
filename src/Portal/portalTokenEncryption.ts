import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export type PortalTokenCipher = {
  encrypt(token: string): string;
  decrypt(value: string): string;
};

export const portalTokenCipher: PortalTokenCipher = {
  encrypt: encryptPortalAccessToken,
  decrypt: decryptPortalAccessToken
};

export function encryptPortalAccessToken(token: string, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", portalTokenEncryptionKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((value) => value.toString("base64url")).join(".");
}

export function decryptPortalAccessToken(value: string, env: NodeJS.ProcessEnv = process.env): string {
  const [ivText, tagText, ciphertextText] = value.split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Invalid portal token ciphertext");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    portalTokenEncryptionKey(env),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function portalTokenEncryptionKey(env: NodeJS.ProcessEnv): Buffer {
  const value = env.PORTAL_TOKEN_ENCRYPTION_KEY?.trim();
  const key = value ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (key.length !== 32) {
    throw new Error("PORTAL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}
