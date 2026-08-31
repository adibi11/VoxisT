import { ILogger, logger } from "../logging/logger";

export type TwilioMessagingServiceResources = {
  messagingServiceSid: string;
  alphaSenderSid: string;
};

export interface ITwilioMessagingServiceProvisioner {
  provisionBusinessSender(businessId: number, senderId: string): Promise<TwilioMessagingServiceResources>;
  deleteMessagingService(messagingServiceSid: string): Promise<void>;
}

type TwilioProvisioningOptions = {
  accountSid?: string;
  authToken?: string;
  baseUrl?: string;
  logger?: ILogger;
};

type TwilioResourceResponse = {
  sid?: string;
  code?: string | number;
};

export class TwilioProvisioningError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    readonly providerCode?: string
  ) {
    super(`Twilio provisioning failed during ${operation}`);
    this.name = "TwilioProvisioningError";
  }
}

export class TwilioMessagingServiceProvisioner implements ITwilioMessagingServiceProvisioner {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly baseUrl: string;
  private readonly provisionerLogger: ILogger;

  constructor(options: TwilioProvisioningOptions = {}) {
    this.accountSid = options.accountSid || process.env.TWILIO_ACCOUNT_SID || "";
    this.authToken = options.authToken || process.env.TWILIO_AUTH_TOKEN || "";
    this.baseUrl = options.baseUrl || "https://messaging.twilio.com/v1";
    this.provisionerLogger =
      options.logger || logger.child({ component: "TwilioMessagingServiceProvisioner" });

    if (!this.accountSid || !this.authToken) {
      throw new Error(
        "TwilioMessagingServiceProvisioner requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN"
      );
    }
  }

  async provisionBusinessSender(
    businessId: number,
    senderId: string
  ): Promise<TwilioMessagingServiceResources> {
    const service = await this.createResource(
      "create_service",
      `${this.baseUrl}/Services`,
      { FriendlyName: `Voxis Business ${businessId} SMS` }
    );

    try {
      const alphaSender = await this.createResource(
        "create_alpha_sender",
        `${this.baseUrl}/Services/${encodeURIComponent(service.sid)}/AlphaSenders`,
        { AlphaSender: senderId }
      );
      this.provisionerLogger.info("twilio.messaging_service.provisioned", {
        businessId,
        messagingServiceSid: service.sid,
        alphaSenderSid: alphaSender.sid
      });
      return {
        messagingServiceSid: service.sid,
        alphaSenderSid: alphaSender.sid
      };
    } catch (error) {
      await this.deleteMessagingService(service.sid);
      throw error;
    }
  }

  async deleteMessagingService(messagingServiceSid: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/Services/${encodeURIComponent(messagingServiceSid)}`,
        {
          method: "DELETE",
          headers: { Authorization: this.authHeader() }
        }
      );
      if (!response.ok && response.status !== 404) {
        const body = await this.parseResponse(response);
        this.provisionerLogger.warn("twilio.messaging_service.cleanup.failed", {
          messagingServiceSid,
          status: response.status,
          twilioErrorCode: sanitizeProviderCode(body.code)
        });
      }
    } catch {
      this.provisionerLogger.warn("twilio.messaging_service.cleanup.unknown", {
        messagingServiceSid
      });
    }
  }

  private async createResource(
    operation: string,
    url: string,
    fields: Record<string, string>
  ): Promise<{ sid: string }> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(fields)
      });
    } catch {
      throw new TwilioProvisioningError(operation, 0);
    }

    const body = await this.parseResponse(response);
    if (!response.ok || !body.sid) {
      const providerCode = sanitizeProviderCode(body.code);
      this.provisionerLogger.error("twilio.messaging_service.provisioning.failed", {
        operation,
        status: response.status,
        twilioErrorCode: providerCode
      });
      throw new TwilioProvisioningError(operation, response.status, providerCode);
    }
    return { sid: body.sid };
  }

  private async parseResponse(response: Response): Promise<TwilioResourceResponse> {
    try {
      return JSON.parse(await response.text()) as TwilioResourceResponse;
    } catch {
      return {};
    }
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`;
  }
}

function sanitizeProviderCode(code: string | number | undefined): string | undefined {
  const value = code === undefined ? undefined : String(code);
  return value && /^[A-Za-z0-9_-]{1,32}$/.test(value) ? value : undefined;
}
