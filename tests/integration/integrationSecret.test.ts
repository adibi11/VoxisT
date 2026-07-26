import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../../src/LeadIngestion/integrationSecret";

describe("integration secret encryption", () => {
    let previousKey: string | undefined;

    beforeEach(() => {
        previousKey = process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY;
        process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    });

    afterEach(() => {
        if (previousKey === undefined) {
            delete process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY;
        } else {
            process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = previousKey;
        }
    });

    it("round-trips channel credentials", () => {
        const credentials = JSON.stringify({ accountSid: "AC123", authToken: "secret_token" });
        const encrypted = encryptIntegrationSecret(credentials);

        expect(encrypted).not.toContain("secret_token");
        expect(decryptIntegrationSecret(encrypted)).toBe(credentials);
    });

    it("produces unique ciphertexts per call", () => {
        const encryptedA = encryptIntegrationSecret("same");
        const encryptedB = encryptIntegrationSecret("same");
        expect(encryptedA).not.toBe(encryptedB);
    });
});
