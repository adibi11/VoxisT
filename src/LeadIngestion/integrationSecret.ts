import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/** Encrypts a server-to-server integration secret using the deployment key. */
export function encryptIntegrationSecret(secret: string): string {
    const key = encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptIntegrationSecret(value: string): string {
    const [ivText, tagText, ciphertextText] = value.split(".");
    if (!ivText || !tagText || !ciphertextText) throw new Error("Invalid integration secret ciphertext");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}

function encryptionKey(): Buffer {
    const value = process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY?.trim();
    const key = value ? Buffer.from(value, "base64") : Buffer.alloc(0);
    if (key.length !== 32) throw new Error("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    return key;
}
