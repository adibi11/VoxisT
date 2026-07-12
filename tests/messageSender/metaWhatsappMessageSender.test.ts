import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunicationChannel, MessageProvider } from "../../src/dataClients/Types/apiTypes";
import { MetaWhatsappMessageSender } from "../../src/MessageSender/metaWhatsappMessageSender";
import { OutboundMessage } from "../../src/MessageSender/messageSenderInterface";

const baseMessage: OutboundMessage = {
  channel: CommunicationChannel.Whatsapp,
  provider: MessageProvider.MetaWhatsapp,
  from: "972501111111",
  to: "whatsapp:+972 50-222-2222",
  body: "Hello from VoxisT",
  businessId: 1,
  clientId: 2,
  conversationId: 3,
  messageId: 4
};

describe("MetaWhatsappMessageSender", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends a text message through Meta WhatsApp Cloud API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({
        messaging_product: "whatsapp",
        contacts: [{ input: "972502222222", wa_id: "972502222222" }],
        messages: [{ id: "wamid.test-message-id", message_status: "accepted" }]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const sender = new MetaWhatsappMessageSender({
      accessToken: "test-access-token",
      phoneNumberId: "123456789",
      graphApiVersion: "v20.0",
      baseUrl: "https://graph.facebook.test"
    });

    const result = await sender.sendMessage(baseMessage);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.test/v20.0/123456789/messages",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-access-token",
          "Content-Type": "application/json"
        }
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "972502222222",
      type: "text",
      text: {
        preview_url: false,
        body: "Hello from VoxisT"
      }
    });
    expect(result.providerMessageId).toBe("wamid.test-message-id");
    expect(result.sentAt).toBeInstanceOf(Date);
  });

  it("uses environment credentials when options are not provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({ messages: [{ id: "wamid.from-env" }] })
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("META_WHATSAPP_ACCESS_TOKEN", "env-access-token");
    vi.stubEnv("META_WHATSAPP_PHONE_NUMBER_ID", "env-phone-number-id");
    vi.stubEnv("META_GRAPH_API_VERSION", "20.0");

    const sender = new MetaWhatsappMessageSender({
      baseUrl: "https://graph.facebook.test/"
    });

    await sender.sendMessage(baseMessage);

    expect(fetchMock.mock.calls[0][0]).toBe("https://graph.facebook.test/v20.0/env-phone-number-id/messages");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer env-access-token");
  });

  it("rejects non-Meta providers", async () => {
    const sender = new MetaWhatsappMessageSender({
      accessToken: "test-access-token",
      phoneNumberId: "123456789"
    });

    await expect(sender.sendMessage({
      ...baseMessage,
      provider: MessageProvider.Twilio
    })).rejects.toThrow("MetaWhatsappMessageSender cannot send provider twilio");
  });

  it("throws a provider error when Meta returns a non-success response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => JSON.stringify({
        error: {
          message: "Invalid parameter",
          type: "OAuthException",
          code: 100,
          fbtrace_id: "trace-id"
        }
      })
    }));

    const sender = new MetaWhatsappMessageSender({
      accessToken: "test-access-token",
      phoneNumberId: "123456789"
    });

    await expect(sender.sendMessage(baseMessage)).rejects.toThrow("Meta WhatsApp message send failed with status 400");
  });

  it("requires credentials", () => {
    expect(() => new MetaWhatsappMessageSender()).toThrow(
      "MetaWhatsappMessageSender requires META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID"
    );
  });
});
