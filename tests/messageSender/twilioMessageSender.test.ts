import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunicationChannel, MessageProvider } from "../../src/dataClients/Types/apiTypes";
import { ILogger, LogData } from "../../src/logging/logger";
import { TwilioMessageSender, TwilioSendOutcomeUnknownError } from "../../src/MessageSender/twilioMessageSender";

class CaptureLogger implements ILogger {
  entries: Array<{ message: string; data?: LogData }> = [];
  debug(message: string, data?: LogData): void { this.entries.push({ message, data }); }
  info(message: string, data?: LogData): void { this.entries.push({ message, data }); }
  warn(message: string, data?: LogData): void { this.entries.push({ message, data }); }
  error(message: string, data?: LogData): void { this.entries.push({ message, data }); }
  child(): ILogger { return this; }
}

const base = {
  provider: MessageProvider.Twilio,
  body: "Open your secure portal",
  businessId: 7,
  clientId: 9
};

describe("TwilioMessageSender", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends ordinary SMS with an alphanumeric sender ID and no WhatsApp prefix", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 201, statusText: "Created",
      text: async () => JSON.stringify({ sid: "SM123", status: "queued" })
    });
    vi.stubGlobal("fetch", fetchMock);
    const logger = new CaptureLogger();
    const sender = new TwilioMessageSender({
      accountSid: "AC-secret-account",
      authToken: "secret-auth-token",
      baseUrl: "https://twilio.test",
      logger
    });

    await sender.sendMessage({
      ...base,
      channel: CommunicationChannel.Sms,
      from: "MOSHEMTG",
      to: "+972501234567"
    });

    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get("From")).toBe("MOSHEMTG");
    expect(body.get("To")).toBe("+972501234567");
    expect(body.get("From")).not.toContain("whatsapp:");
    const logs = JSON.stringify(logger.entries);
    expect(logs).not.toContain("AC-secret-account");
    expect(logs).not.toContain("secret-auth-token");
    expect(logs).not.toContain("+972501234567");
    expect(logs).not.toContain("Open your secure portal");
  });

  it("sends SMS through a Messaging Service without a From parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 201, statusText: "Created",
      text: async () => JSON.stringify({ sid: "SM125", status: "queued" })
    });
    vi.stubGlobal("fetch", fetchMock);
    const sender = new TwilioMessageSender({
      accountSid: "AC123",
      authToken: "token",
      baseUrl: "https://twilio.test",
      logger: new CaptureLogger()
    });

    await sender.sendMessage({
      ...base,
      channel: CommunicationChannel.Sms,
      messagingServiceSid: "MG123",
      to: "+972501234567"
    });

    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get("MessagingServiceSid")).toBe("MG123");
    expect(body.has("From")).toBe(false);
  });
  it("classifies a network failure as an ambiguous outcome without logging the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket timeout")));
    const logger = new CaptureLogger();
    const sender = new TwilioMessageSender({
      accountSid: "AC123",
      authToken: "token",
      baseUrl: "https://twilio.test",
      logger
    });
    await expect(sender.sendMessage({
      ...base,
      channel: CommunicationChannel.Sms,
      from: "VOXIS",
      to: "+972501234567"
    })).rejects.toBeInstanceOf(TwilioSendOutcomeUnknownError);
    expect(JSON.stringify(logger.entries)).not.toContain("+972501234567");
  });

});
