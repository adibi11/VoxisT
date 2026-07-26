import { beforeEach, describe, expect, it } from "vitest";
import { FakeSqlManager } from "../fakes/FakeSqlManager";
import { normalizePhoneDigits } from "../../src/dataClients/Types/phoneNumber";

describe("normalizePhoneDigits", () => {
    it("strips whatsapp prefix, plus sign, and separators", () => {
        expect(normalizePhoneDigits("whatsapp:+972-52 123 4567")).toBe("972521234567");
        expect(normalizePhoneDigits("+14155552671")).toBe("14155552671");
        expect(normalizePhoneDigits("WhatsApp:+1 (415) 555-2671")).toBe("14155552671");
    });

    it("returns empty for missing values", () => {
        expect(normalizePhoneDigits(null)).toBe("");
        expect(normalizePhoneDigits("")).toBe("");
    });
});

describe("BusinessChannel credential resolution", () => {
    let sql: FakeSqlManager;

    beforeEach(async () => {
        sql = new FakeSqlManager();
        await sql.UpsertChannelByBusinessId(7, {
            channel: "whatsapp",
            provider: "twilio",
            status: "active",
            externalPhoneNumberId: "+972521111111",
            isDefault: true,
            credentials: { accountSid: "AC_seven", authToken: "token_seven" }
        });
        await sql.UpsertChannelByBusinessId(8, {
            channel: "whatsapp",
            provider: "twilio",
            status: "active",
            externalPhoneNumberId: "+972522222222",
            credentials: { accountSid: "AC_eight", authToken: "token_eight" }
        });
    });

    it("resolves inbound business and credentials by the receiving number", async () => {
        const resolved = await sql.GetChannelForInbound("twilio", "whatsapp:+972522222222");
        expect(resolved?.channel.businessId).toBe(8);
        expect(resolved?.credentials?.authToken).toBe("token_eight");
    });

    it("returns null for unknown receiving numbers", async () => {
        expect(await sql.GetChannelForInbound("twilio", "whatsapp:+15550000000")).toBeNull();
    });

    it("does not resolve disabled channels for inbound", async () => {
        await sql.UpsertChannelByBusinessId(8, {
            channel: "whatsapp",
            provider: "twilio",
            status: "disabled"
        });
        expect(await sql.GetChannelForInbound("twilio", "+972522222222")).toBeNull();
    });

    it("resolves outbound credentials by business and from-number", async () => {
        const resolved = await sql.GetChannelForOutbound(7, "twilio", "whatsapp:+972521111111");
        expect(resolved?.credentials?.accountSid).toBe("AC_seven");
    });

    it("falls back to the default channel when the from-number does not match", async () => {
        const resolved = await sql.GetChannelForOutbound(7, "twilio", "whatsapp:+15559999999");
        expect(resolved?.channel.isDefault).toBe(true);
        expect(resolved?.credentials?.accountSid).toBe("AC_seven");
    });

    it("returns null when the business has no channel for the provider", async () => {
        expect(await sql.GetChannelForOutbound(99, "twilio")).toBeNull();
    });

    it("never exposes credentials through the channel DTO", async () => {
        const channels = await sql.GetChannelsByBusinessId(7);
        expect(channels[0].hasCredentials).toBe(true);
        expect(JSON.stringify(channels)).not.toContain("token_seven");
    });

    it("removes credentials when null is sent", async () => {
        await sql.UpsertChannelByBusinessId(7, {
            channel: "whatsapp",
            provider: "twilio",
            credentials: null
        });
        const resolved = await sql.GetChannelForOutbound(7, "twilio");
        expect(resolved?.credentials).toBeNull();
    });
});
