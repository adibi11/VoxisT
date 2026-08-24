import { describe, expect, it } from "vitest";
import { decryptPortalAccessToken, encryptPortalAccessToken } from "../../src/Portal/portalTokenEncryption";

const env = {
  PORTAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64")
} as NodeJS.ProcessEnv;

describe("portal token encryption", () => {
  it("uses authenticated encryption and does not persist plaintext", () => {
    const token = "a".repeat(43);
    const encrypted = encryptPortalAccessToken(token, env);
    expect(encrypted).not.toContain(token);
    expect(decryptPortalAccessToken(encrypted, env)).toBe(token);
    const parts = encrypted.split(".");
    parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
    expect(() => decryptPortalAccessToken(parts.join("."), env)).toThrow();
  });
});
