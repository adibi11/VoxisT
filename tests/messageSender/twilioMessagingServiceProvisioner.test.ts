import { afterEach, describe, expect, it, vi } from "vitest";
import { ILogger, LogData } from "../../src/logging/logger";
import {
  TwilioMessagingServiceProvisioner,
  TwilioProvisioningError
} from "../../src/MessageSender/twilioMessagingServiceProvisioner";

class CaptureLogger implements ILogger {
  entries: Array<{ message: string; data?: LogData }> = [];
  debug(message: string, data?: LogData): void { this.entries.push({ message, data }); }
  info(message: string, data?: LogData): void { this.entries.push({ message, data }); }
  warn(message: string, data?: LogData): void { this.entries.push({ message, data }); }
  error(message: string, data?: LogData): void { this.entries.push({ message, data }); }
  child(): ILogger { return this; }
}

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}

describe("TwilioMessagingServiceProvisioner", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates one Messaging Service and attaches the Business Alpha Sender", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(201, { sid: "MG123" }))
      .mockResolvedValueOnce(response(201, { sid: "AI123" }));
    vi.stubGlobal("fetch", fetchMock);
    const provisioner = new TwilioMessagingServiceProvisioner({
      accountSid: "AC-secret",
      authToken: "token-secret",
      baseUrl: "https://messaging.twilio.test/v1",
      logger: new CaptureLogger()
    });

    await expect(provisioner.provisionBusinessSender(7, "LEVFIN")).resolves.toEqual({
      messagingServiceSid: "MG123",
      alphaSenderSid: "AI123"
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://messaging.twilio.test/v1/Services");
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get("FriendlyName"))
      .toBe("Voxis Business 7 SMS");
    expect(fetchMock.mock.calls[1][0])
      .toBe("https://messaging.twilio.test/v1/Services/MG123/AlphaSenders");
    expect(new URLSearchParams(fetchMock.mock.calls[1][1].body).get("AlphaSender"))
      .toBe("LEVFIN");
  });

  it("deletes the newly-created service when Alpha Sender creation fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(201, { sid: "MG123" }))
      .mockResolvedValueOnce(response(400, { code: 21612 }))
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const provisioner = new TwilioMessagingServiceProvisioner({
      accountSid: "AC123",
      authToken: "token",
      baseUrl: "https://messaging.twilio.test/v1",
      logger: new CaptureLogger()
    });

    await expect(provisioner.provisionBusinessSender(7, "LEVFIN"))
      .rejects.toMatchObject<TwilioProvisioningError>({
        operation: "create_alpha_sender",
        status: 400,
        providerCode: "21612"
      });
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
  });

  it("does not log credentials or the authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401, { code: 20003 }));
    vi.stubGlobal("fetch", fetchMock);
    const logger = new CaptureLogger();
    const provisioner = new TwilioMessagingServiceProvisioner({
      accountSid: "AC-secret-account",
      authToken: "secret-auth-token",
      baseUrl: "https://messaging.twilio.test/v1",
      logger
    });

    await expect(provisioner.provisionBusinessSender(7, "LEVFIN")).rejects.toBeInstanceOf(
      TwilioProvisioningError
    );
    const logs = JSON.stringify(logger.entries);
    expect(logs).not.toContain("AC-secret-account");
    expect(logs).not.toContain("secret-auth-token");
  });
});
