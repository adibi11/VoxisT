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
      channel: "whatsapp", provider: "twilio", status: "active",
      externalPhoneNumberId: "+972521111111", isDefault: true,
      credentials: { accountSid: "AC_whatsapp", authToken: "token_whatsapp" }
    });
    await sql.UpsertChannelByBusinessId(7, {
      channel: "sms", provider: "twilio", status: "active",
      externalPhoneNumberId: "MOSHEMTG",
      credentials: { accountSid: "AC_sms", authToken: "token_sms" }
    });
    await sql.UpsertChannelByBusinessId(8, {
      channel: "whatsapp", provider: "twilio", status: "active",
      externalPhoneNumberId: "+972522222222",
      credentials: { accountSid: "AC_eight", authToken: "token_eight" }
    });
  });

  it("resolves inbound business and credentials by receiving number", async () => {
    const resolved = await sql.GetChannelForInbound("twilio", "whatsapp:+972522222222");
    expect(resolved?.channel.businessId).toBe(8);
    expect(resolved?.credentials?.authToken).toBe("token_eight");
  });
  it("returns null for unknown or disabled inbound numbers", async () => {
    expect(await sql.GetChannelForInbound("twilio", "whatsapp:+15550000000")).toBeNull();
    await sql.UpsertChannelByBusinessId(8, { channel: "whatsapp", provider: "twilio", status: "disabled" });
    expect(await sql.GetChannelForInbound("twilio", "+972522222222")).toBeNull();
  });
  it("resolves WhatsApp credentials by business, channel, and from number", async () => {
    const resolved = await sql.GetChannelForOutbound(7, "whatsapp", "twilio", "whatsapp:+972521111111");
    expect(resolved?.credentials?.accountSid).toBe("AC_whatsapp");
  });
  it("falls back to the channel default when the from number does not match", async () => {
    const resolved = await sql.GetChannelForOutbound(7, "whatsapp", "twilio", "whatsapp:+15559999999");
    expect(resolved?.channel.isDefault).toBe(true);
  });
  it("resolves SMS only from the SMS channel", async () => {
    const resolved = await sql.GetChannelForOutbound(7, "sms", "twilio", "MOSHEMTG");
    expect(resolved?.channel.channel).toBe("sms");
    expect(resolved?.channel.externalPhoneNumberId).toBe("MOSHEMTG");
    expect(resolved?.credentials?.accountSid).toBe("AC_sms");
  });
  it("does not select Twilio WhatsApp for disabled or pending SMS", async () => {
    await sql.UpsertChannelByBusinessId(7, { channel: "sms", provider: "twilio", status: "disabled" });
    expect(await sql.GetChannelForOutbound(7, "sms", "twilio")).toBeNull();
    await sql.UpsertChannelByBusinessId(7, { channel: "sms", provider: "twilio", status: "pending" });
    expect(await sql.GetChannelForOutbound(7, "sms", "twilio")).toBeNull();
    expect((await sql.GetChannelForOutbound(7, "whatsapp", "twilio"))?.channel.channel).toBe("whatsapp");
  });
  it("returns null when the business has no matching channel", async () => {
    expect(await sql.GetChannelForOutbound(99, "sms", "twilio")).toBeNull();
  });
  it("never exposes credentials through channel DTOs", async () => {
    const channels = await sql.GetChannelsByBusinessId(7);
    expect(channels.every((channel) => channel.hasCredentials)).toBe(true);
    expect(JSON.stringify(channels)).not.toContain("token_sms");
  });
  it("removes credentials only when explicitly requested", async () => {
    await sql.UpsertChannelByBusinessId(7, { channel: "sms", provider: "twilio", credentials: null });
    expect((await sql.GetChannelForOutbound(7, "sms", "twilio"))?.credentials).toBeNull();
  });
});
